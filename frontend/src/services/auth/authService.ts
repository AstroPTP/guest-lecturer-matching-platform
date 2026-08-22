import type { AuthenticationResult, RegisteredAccount } from "@/types/auth/authTypes";
import { isAppRole, toAccountRole } from "./roleMapper";

/**
 * Authentication for the browser.
 *
 * Every exported name and signature is unchanged from the stub version this
 * replaces — LoginForm and DashboardSidebar call these and needed no edits.
 *
 * No password ever passes through this module in the production flow. Auth0's
 * hosted login collects credentials on Auth0's own domain and returns via
 * Authorization Code + PKCE (SAS §2.5.1), which is why registerAccount and
 * resetAccountPassword hand off rather than posting a password anywhere. That
 * was one of the outcomes recorded in KAN-223.
 *
 * The access token is never handled here. It lives in an HttpOnly cookie set
 * by the route handlers under /api/auth, and is attached to API calls
 * server-side by /api/backend.
 */

interface SessionResponse {
  user: { id: string; email: string; name: string; roles: string[] } | null;
}

async function currentAccount(): Promise<RegisteredAccount | null> {
  const response = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (!response.ok) {
    return null;
  }

  const body = (await response.json()) as SessionResponse;
  if (!body.user) {
    return null;
  }

  const roles = body.user.roles.filter(isAppRole);

  return {
    id: body.user.id,
    fullName: body.user.name || body.user.email.split("@")[0],
    email: body.user.email,
    // Null means no administrator has granted a role yet. Defaulting to the
    // least-privileged view is a display choice; the backend still refuses
    // every guarded route, which is the behaviour that matters.
    role: toAccountRole(roles) ?? "guest",
    emailVerified: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Signs in against the development identity provider.
 *
 * Production replaces this with a redirect to Auth0's hosted login. The
 * signature is kept so LoginForm does not change again when it does.
 */
export async function authenticateAccount(email: string, _password: string): Promise<AuthenticationResult> {
  const response = await fetch("/api/auth/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email }),
  });

  if (response.status === 404) {
    return {
      success: false,
      error:
        "Login is not configured. Set NEXT_PUBLIC_DEV_LOGIN=true and run the dev IdP, " +
        "or point AUTH0_DOMAIN at the real tenant.",
    };
  }

  if (!response.ok) {
    // Deliberately the same message whether the account is unknown or the
    // credentials are wrong — telling them apart lets anyone discover who has
    // an account (checklist INF-05).
    return {
      success: false,
      error: "That email or password is incorrect.",
      reason: "incorrect_password",
    };
  }

  const account = await currentAccount();
  if (!account) {
    return { success: false, error: "Sign in did not complete. Please try again." };
  }

  return { success: true, account };
}

export async function getCurrentAccount(): Promise<RegisteredAccount | null> {
  return currentAccount();
}

export async function logoutCurrentAccount(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
}

/**
 * Registration is Auth0-hosted. This module never sees a password, so there is
 * nothing to post — the caller sends the user to Auth0's sign-up screen.
 */
export async function registerAccount(_params: {
  fullName: string;
  email: string;
  password: string;
  role: string;
}): Promise<AuthenticationResult> {
  return {
    success: false,
    error: "Registration is handled by Auth0's hosted sign-up. See KAN-223.",
  };
}

/** Email verification is handled by Auth0 before the user reaches us. */
export async function verifyRegisteredAccount(_code: string): Promise<boolean> {
  return Promise.resolve(true);
}

/**
 * Supabase and Auth0 both refuse to answer this, and so do we. A truthful
 * answer lets anyone enumerate who has an account.
 */
export async function accountExists(_email: string): Promise<boolean> {
  return Promise.resolve(true);
}

/** Password reset is Auth0-hosted; the frontend never sets a password. */
export async function resetAccountPassword(_newPassword: string): Promise<boolean> {
  return Promise.resolve(false);
}

export async function verifyPasswordResetCode(_email: string, _code: string): Promise<boolean> {
  return Promise.resolve(false);
}
