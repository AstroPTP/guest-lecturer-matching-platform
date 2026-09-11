import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithSecret } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { APP_ENV } from '../config/app-env.token';
import { auth0Issuer, auth0JwksUri } from '../config/env.validation';
import type { AppEnv } from '../config/env.validation';
import type { AuthenticatedUser } from './authenticated-user';
import { AppRole, isAppRole } from './roles';

/** The JWKS response is cached for ten minutes. */
const JWKS_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * The shape we care about in a verified token. Everything is optional because
 * this describes untrusted input: the signature proves who issued the token,
 * not that any particular claim is present or well-formed.
 */
interface Auth0JwtPayload {
  sub?: unknown;
  email?: unknown;
  [claim: string]: unknown;
}

/**
 * Verifies the RS256 signature on an incoming bearer token against Auth0's
 * published signing keys, then reduces it to an AuthenticatedUser.
 *
 * The security of the whole authorisation model rests on this class. A role is
 * not trusted because the token says so. It is trusted because the token
 * carrying it was signed by a private key we never hold, the matching public
 * key is published at a URL we control the address of, and the only thing that
 * can put that claim into an Auth0-signed token is the Post-Login Action,
 * which reads app_metadata, which the end user cannot write.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly rolesClaim: string;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    const options: StrategyOptionsWithSecret = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      secretOrKeyProvider: passportJwtSecret({
        jwksUri: auth0JwksUri(env.auth0Domain),
        cache: true,
        cacheMaxAge: JWKS_CACHE_MAX_AGE_MS,
        // Bounds outbound requests if we are handed tokens citing key ids that
        // do not exist, so an attacker cannot turn our verification path into
        // a request amplifier against the tenant's JWKS endpoint.
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      }),

      // Checked, not merely configured. A token for another audience, or from
      // another tenant, is a valid signature over the wrong claims.
      //
      // Auth0's issuer carries a trailing slash and it is not optional. It is
      // compared against `iss` as an exact string.
      issuer: auth0Issuer(env.auth0Domain),
      audience: env.auth0Audience,

      // The single most important line in this file. Without an explicit
      // allowlist, a token whose header says {"alg":"none"} or one signed
      // HS256 using the RSA public key as the shared secret can be made to
      // verify. This is the algorithm-confusion attack, SPF-03 and SPF-05.
      algorithms: ['RS256'],

      // Expiry is enforced by passport-jwt. Stated explicitly so that turning
      // it off has to be a deliberate edit rather than an omission (SPF-06).
      ignoreExpiration: false,
    };

    super(options);
    this.rolesClaim = env.auth0RolesClaim;
  }

  /**
   * Runs only after the signature, issuer, audience and expiry have all
   * passed. Anything thrown here becomes a 401.
   */
  validate(payload: Auth0JwtPayload): AuthenticatedUser {
    const subject = payload.sub;
    if (typeof subject !== 'string' || subject.length === 0) {
      // Every audit record is keyed on this. A verified token with no subject
      // is not something to carry on with.
      throw new UnauthorizedException('Token has no subject claim');
    }

    return {
      id: subject,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      roles: this.extractRoles(payload),
    };
  }

  /**
   * Pulls the role list out of the namespaced claim.
   *
   * The namespace, https://glmp.curtin.edu.au/roles, is not decoration. Auth0
   * silently discards custom claims whose name is not a URI, so a claim called
   * plain `roles` never appears in the token at all, with no error anywhere to
   * say why.
   *
   * The Action that sets it reads `app_metadata`, never `user_metadata`.
   * user_metadata is writable by the end user through Auth0's own endpoints,
   * so a role stored there would be self-assignable. That is the
   * elevation-of-privilege path this closes.
   *
   * A missing or malformed claim yields an empty array, never a default role.
   * That is the fail-closed behaviour checklist item EOP-04 tests for: if the
   * Action is disabled or throws, tokens arrive bare and every guarded route
   * denies, rather than every route opening up.
   */
  private extractRoles(payload: Auth0JwtPayload): AppRole[] {
    const claimed: unknown = payload[this.rolesClaim];

    if (!Array.isArray(claimed)) {
      return [];
    }

    // De-duplicated, and unknown values dropped rather than passed through.
    return [...new Set(claimed.filter(isAppRole))];
  }
}
