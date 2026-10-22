import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppRole } from '../auth/roles';
import { ErrorCode } from '../common/error-codes';
import { prisma, resolveUserId } from '../prisma';

type Identity = { provider: string; connection: string; user_id: string };

/** The fields we read from an Auth0 Management API user. */
type AuthUser = {
  user_id: string;
  email?: string;
  email_verified?: boolean;
  identities: Identity[];
  app_metadata?: { roles?: unknown };
};

/** Roles a user may pick for themselves at registration. Never ccae_admin. */
const SELF_SELECTED_ROLES: string[] = [
  AppRole.GuestSpeaker,
  AppRole.UnitCoordinator,
];

const REQUEST_TIMEOUT_MS = 15000;

/** Renew the Management API token this long before Auth0 says it expires. */
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;

/** A password account, as opposed to Google, LinkedIn or passwordless email. */
const isDatabaseUser = (user: AuthUser) =>
  user.identities.some((item) => item.provider === 'auth0');

/**
 * Roles are read from app_metadata only. user_metadata is writable by the end
 * user, so a role stored there would be self-assignable.
 */
const rolesOf = (user: AuthUser): string[] => {
  const stored: unknown = user.app_metadata?.roles;
  return Array.isArray(stored)
    ? (stored as unknown[]).filter(
        (item): item is string => typeof item === 'string',
      )
    : [];
};

/**
 * Roles held by the same person's other, verified sign-ins (for example the
 * passwordless account the registration OTP created), so they carry over to
 * the password account. Only self-selectable roles are carried.
 */
const carriedRoles = (accounts: AuthUser[]): string[] =>
  accounts
    .filter((account) => !isDatabaseUser(account) && account.email_verified)
    .flatMap(rolesOf)
    .filter((held) => SELF_SELECTED_ROLES.includes(held));

/**
 * Account operations that Auth0 has to perform: creating the password account,
 * changing email or password, merging roles and deleting the account.
 *
 * Talks to two Auth0 clients, both server-only:
 *   - AUTH0_MANAGEMENT_*: machine-to-machine, for the Management API.
 *   - AUTH0_SETTINGS_*: has the password-realm grant, used only to check a
 *     user's current password before a sensitive change.
 *
 * Variables are read when a request needs them rather than at boot, so the
 * rest of the API still runs on a machine that has not configured them; these
 * routes then answer 503 instead.
 */
@Injectable()
export class SettingsService {
  private managementToken?: { value: string; expiresAt: number };

  private required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        'Account management is not configured on the server.',
      );
    }
    return value;
  }

  private get origin(): string {
    const domain = this.required('AUTH0_DOMAIN');
    if (!/^[a-zA-Z0-9.-]+$/.test(domain)) {
      throw new ServiceUnavailableException(
        'Account management domain is invalid.',
      );
    }
    return 'https://' + domain;
  }

  /**
   * One call to Auth0. Auth0's own error detail is never passed to the
   * client; it only decides between "retry later" (503) and "bad input" (400).
   */
  private async request<T>(
    path: string,
    init: RequestInit,
    allowMissing = false,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.origin + path, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException(
        'The identity service is unavailable. Please retry.',
      );
    }

    if (allowMissing && response.status === 404) {
      return undefined as T;
    }

    if (!response.ok) {
      if (
        response.status === 429 ||
        response.status >= 500 ||
        response.status === 401 ||
        response.status === 403
      ) {
        throw new ServiceUnavailableException(
          'The identity service could not complete this request. Please retry or contact support.',
        );
      }
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message:
          'The identity service rejected this change. Check the details and password requirements.',
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  /**
   * A Management API token, reused until shortly before it expires. Auth0
   * limits how many machine-to-machine tokens a tenant may issue, so asking
   * for a fresh one on every call would use that quota up.
   */
  private async managementAccessToken(): Promise<string> {
    if (
      this.managementToken &&
      this.managementToken.expiresAt > Date.now() + TOKEN_EXPIRY_MARGIN_MS
    ) {
      return this.managementToken.value;
    }

    const token = await this.request<{
      access_token: string;
      expires_in: number;
    }>('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.required('AUTH0_MANAGEMENT_CLIENT_ID'),
        client_secret: this.required('AUTH0_MANAGEMENT_CLIENT_SECRET'),
        audience: this.origin + '/api/v2/',
        grant_type: 'client_credentials',
      }),
    });

    this.managementToken = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return token.access_token;
  }

  private async management<T>(
    path: string,
    method = 'GET',
    body?: object,
    allowMissing = false,
  ): Promise<T> {
    const accessToken = await this.managementAccessToken();
    return this.request<T>(
      '/api/v2' + path,
      {
        method,
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      allowMissing,
    );
  }

  private userPath(id: string): string {
    return '/users/' + encodeURIComponent(id);
  }

  private findByEmail(email: string): Promise<AuthUser[]> {
    return this.management<AuthUser[]>(
      '/users-by-email?email=' + encodeURIComponent(email.trim().toLowerCase()),
    );
  }

  /** The caller's own password identity, or null for social sign-ins. */
  private passwordIdentity(id: string, user: AuthUser): Identity | undefined {
    return user.identities.find(
      (item) => item.provider === 'auth0' && id === 'auth0|' + item.user_id,
    );
  }

  /**
   * Proves the caller knows their current password before a sensitive change,
   * and that the password belongs to this account and not another one.
   */
  private async verifyPassword(
    id: string,
    password: string,
  ): Promise<{ user: AuthUser; identity: Identity }> {
    const user = await this.management<AuthUser>(this.userPath(id));
    const identity = this.passwordIdentity(id, user);
    if (!identity || !user.email) {
      throw new BadRequestException(
        'Manage email and password with your Google, Microsoft or other sign-in provider.',
      );
    }

    const response = await fetch(this.origin + '/oauth/token', {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
        client_id: this.required('AUTH0_SETTINGS_CLIENT_ID'),
        client_secret: this.required('AUTH0_SETTINGS_CLIENT_SECRET'),
        realm: identity.connection,
        username: user.email,
        password,
        scope: 'openid email',
      }),
    }).catch(() => {
      throw new ServiceUnavailableException(
        'Unable to verify your password. Please retry.',
      );
    });

    if (!response.ok) {
      const failure = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (failure?.error === 'invalid_grant') {
        throw new ForbiddenException({
          code: ErrorCode.InvalidCurrentPassword,
          message: 'Current password is incorrect.',
        });
      }
      throw new ServiceUnavailableException(
        'Password verification could not complete. Your account may require MFA or a different sign-in method.',
      );
    }

    const token = (await response.json()) as { access_token: string };
    const claims = await this.request<{ sub: string }>('/userinfo', {
      headers: { Authorization: 'Bearer ' + token.access_token },
    });
    if (claims.sub !== id) {
      throw new ForbiddenException(
        'Password does not belong to the signed-in account.',
      );
    }

    return { user, identity };
  }

  /** The caller's email, only once Auth0 says it has been verified. */
  private async verifiedEmail(id: string): Promise<string> {
    const caller = await this.management<AuthUser>(this.userPath(id));
    if (!caller.email || !caller.email_verified) {
      throw new ForbiddenException('Verify your email address first.');
    }
    return caller.email;
  }

  async getAccount(id: string) {
    const user = await this.management<AuthUser>(this.userPath(id));
    return { userId: id, email: user.email ?? '' };
  }

  async changeEmail(id: string, email: string, password: string) {
    const { user } = await this.verifyPassword(id, password);
    if (email.toLowerCase() === user.email?.toLowerCase()) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: 'Enter a different email address.',
      });
    }

    await this.management(this.userPath(id), 'PATCH', {
      email,
      email_verified: false,
      verify_email: true,
    });
    await prisma.users.updateMany({ where: { auth0Id: id }, data: { email } });
    return { success: true };
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (currentPassword === newPassword) {
      throw new BadRequestException({
        code: ErrorCode.ValidationFailed,
        message: 'Choose a different password.',
      });
    }

    const { identity } = await this.verifyPassword(id, currentPassword);
    await this.management(this.userPath(id), 'PATCH', {
      password: newPassword,
      connection: identity.connection,
    });
    return { success: true };
  }

  /**
   * Sets a new password on the password account that shares the caller's
   * verified email. The caller is signed in through the forgot-password OTP,
   * which is a different Auth0 account from the password one.
   */
  async resetPassword(id: string, newPassword: string) {
    const email = await this.verifiedEmail(id);
    const account = (await this.findByEmail(email)).find(isDatabaseUser);
    const identity = account?.identities.find(
      (item) => item.provider === 'auth0',
    );
    if (!account || !identity) {
      throw new BadRequestException(
        'No password account exists for this email. Please register first.',
      );
    }

    await this.management(this.userPath(account.user_id), 'PATCH', {
      password: newPassword,
      connection: identity.connection,
    });
    return { success: true };
  }

  /** Whether a password account with at least one role uses this email. */
  async isRegistered(email: string) {
    const users = await this.findByEmail(email);
    return {
      exists: users.some(
        (user) => isDatabaseUser(user) && rolesOf(user).length > 0,
      ),
    };
  }

  /**
   * Gives a password account with no role the role held by the same person's
   * other verified sign-in. `changed: true` tells the login route to request a
   * new token, because the one it holds was issued before the role was written.
   *
   * One email holds one role, so an account that already has a role is never
   * given another, and an ambiguous source (two different roles) is ignored.
   */
  async syncRoles(id: string) {
    const caller = await this.management<AuthUser>(this.userPath(id));
    if (!isDatabaseUser(caller) || !caller.email || !caller.email_verified) {
      return { changed: false };
    }
    if (rolesOf(caller).length > 0) {
      return { changed: false };
    }

    const carried = [
      ...new Set(carriedRoles(await this.findByEmail(caller.email))),
    ];
    if (carried.length !== 1) {
      return { changed: false };
    }

    await this.management(this.userPath(id), 'PATCH', {
      app_metadata: { roles: carried },
    });
    return { changed: true };
  }

  /**
   * Creates the password account, with its one role, for a caller whose email
   * the registration OTP has just verified.
   *
   * One email holds one account and one role. An email that already has a
   * password account is refused rather than given another role or a new
   * password: reporting success there left users unable to sign in with the
   * password they had just typed.
   */
  async completeRegistration(
    id: string,
    choice: 'guest' | 'coordinator',
    name: string,
    password: string,
  ) {
    const role =
      choice === 'coordinator' ? AppRole.UnitCoordinator : AppRole.GuestSpeaker;
    const email = await this.verifiedEmail(id);
    const accounts = await this.findByEmail(email);

    if (accounts.some(isDatabaseUser)) {
      throw new ConflictException({
        code: ErrorCode.AccountExists,
        message:
          'An account with this email already exists. Please log in or reset your password.',
      });
    }

    const roles = [role];

    await this.management('/users', 'POST', {
      connection:
        process.env.AUTH0_DB_CONNECTION?.trim() ||
        'Username-Password-Authentication',
      email,
      password,
      name,
      email_verified: true,
      app_metadata: { roles },
    });
    return { success: true };
  }

  /**
   * Deletes the Auth0 user, then the caller's rows: profiles, profile photos,
   * topics, availability and notifications.
   *
   * The users row itself is kept with deletedat set and personal fields
   * cleared. JwtAuthGuard refuses any token whose subject has that marker, so
   * a token issued before the deletion cannot recreate data while it is still
   * unexpired.
   */
  async deleteAccount(id: string) {
    await this.management(this.userPath(id), 'DELETE', undefined, true);

    const userId = await resolveUserId(id);
    await prisma.$transaction(async (tx) => {
      // The photos hang off the profiles, so their ids are read before the
      // profiles go. Deleting the profile alone would leave the image bytes
      // behind with nothing pointing at them.
      const guest = await tx.guests.findUnique({
        where: { user_id: userId },
        select: { profile_image_id: true },
      });
      const coordinator = await tx.coordinators.findUnique({
        where: { user_id: userId },
        select: { profile_image_id: true },
      });
      const photoIds = [guest, coordinator].flatMap((profile) =>
        profile?.profile_image_id == null ? [] : [profile.profile_image_id],
      );

      await tx.availability.deleteMany({ where: { user_id: userId } });
      await tx.user_expertise.deleteMany({ where: { user_id: userId } });
      await tx.notifications.deleteMany({ where: { user_id: userId } });
      // match_requests, and the messages under them, cascade from these two.
      await tx.guests.deleteMany({ where: { user_id: userId } });
      await tx.coordinators.deleteMany({ where: { user_id: userId } });
      if (photoIds.length > 0) {
        await tx.images.deleteMany({ where: { image_id: { in: photoIds } } });
      }
      await tx.users.update({
        where: { userid: userId },
        data: {
          email: null,
          role: null,
          consentstate: false,
          lastloginat: null,
          deletedat: new Date(),
        },
      });
    });

    return { success: true };
  }
}
