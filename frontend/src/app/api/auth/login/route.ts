import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth0 } from "@/lib/auth0";
import { backendUrl } from "@/lib/auth/config";
import { clientAddress, tooManyAttempts } from "@/lib/rateLimit";

/**
 * Password sign-in for our own login form.
 *
 * SDK v4 only signs users in through Universal Login or passwordless, so this
 * route asks Auth0 for tokens with the password-realm grant and then stores
 * them with the same method the SDK's passwordless.verify() uses. The result
 * is an ordinary SDK session cookie; nothing else in the app can tell the
 * difference.
 *
 * That method is internal to the SDK, which is why package.json pins
 * @auth0/nextjs-auth0 to an exact version. The checks in sessionStarter() turn
 * an SDK change into a logged error instead of a silent failure.
 */

interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  token_type: string;
  scope?: string;
  expires_in: number;
}

interface SessionStarter {
  createSessionFromPasswordlessVerify(tokens: TokenResponse, req: unknown, res: unknown): Promise<void>;
}

async function sessionStarter(req: NextRequest): Promise<SessionStarter> {
  const provider = (auth0.passwordless as unknown as {
    provider?: { forRequest?: (headers: Headers, url?: URL) => Promise<SessionStarter> };
  }).provider;
  if (!provider?.forRequest) {
    throw new Error("The Auth0 SDK no longer exposes the session starter this route relies on.");
  }
  const client = await provider.forRequest(req.headers, req.nextUrl);
  if (typeof client.createSessionFromPasswordlessVerify !== "function") {
    throw new Error("The Auth0 SDK no longer exposes createSessionFromPasswordlessVerify.");
  }
  return client;
}

const MAX_ATTEMPTS = 8;
const SIGN_IN_FAILED = "We couldn't sign you in right now. Please try again.";

/**
 * Asks the backend to copy roles from the user's other sign-ins onto this
 * account. True means roles changed, so the token just issued is out of date.
 * Never blocks sign-in: a failure here only means the roles are not merged yet.
 */
async function rolesWereMerged(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${backendUrl()}/settings/sync-roles`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn("Role sync was skipped:", response.status);
      return false;
    }
    return ((await response.json()) as { changed?: boolean }).changed === true;
  } catch (error) {
    console.warn("Role sync was skipped:", error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const clientIp = clientAddress(req.headers);
  if (tooManyAttempts(`login|${clientIp}|${email}`, MAX_ATTEMPTS)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  }

  const domain = process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_CLIENT_ID;
  const clientSecret = process.env.AUTH0_CLIENT_SECRET;
  if (!domain || !clientId || !clientSecret) {
    console.error("Password login is not configured: AUTH0_DOMAIN, AUTH0_CLIENT_ID or AUTH0_CLIENT_SECRET is missing.");
    return NextResponse.json({ error: SIGN_IN_FAILED }, { status: 502 });
  }

  const tokenRequest = new URLSearchParams({
    grant_type: "http://auth0.com/oauth/grant-type/password-realm",
    client_id: clientId,
    client_secret: clientSecret,
    realm: process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication",
    username: email,
    password,
    // Must match lib/auth0.js. offline_access returns a refresh token, which
    // the session stores so the access token can be renewed after an hour.
    scope: "openid profile email offline_access",
  });
  // Without an audience the access token is not for our API, and the backend
  // rejects every call with 401.
  if (process.env.AUTH0_AUDIENCE) {
    tokenRequest.set("audience", process.env.AUTH0_AUDIENCE);
  }

  const requestTokens = () =>
    fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Lets Auth0's brute-force protection see the real client, not us.
        ...(clientIp ? { "auth0-forwarded-for": clientIp } : {}),
      },
      body: tokenRequest,
      cache: "no-store",
    }).catch(() => null);

  const response = await requestTokens();
  if (!response) {
    return NextResponse.json({ error: SIGN_IN_FAILED }, { status: 502 });
  }

  if (!response.ok) {
    const failure = (await response.json().catch(() => null)) as { error?: string; error_description?: string } | null;
    if (failure?.error === "invalid_grant") {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }
    if (failure?.error === "too_many_attempts") {
      return NextResponse.json({ error: "Too many failed attempts. Please try again later." }, { status: 429 });
    }
    console.error("Password login failed:", failure?.error, failure?.error_description);
    return NextResponse.json({ error: SIGN_IN_FAILED }, { status: 502 });
  }

  let tokens = (await response.json()) as TokenResponse;
  if (await rolesWereMerged(tokens.access_token)) {
    // Ask again so the session carries the merged roles.
    const refreshed = await requestTokens();
    if (refreshed?.ok) {
      tokens = (await refreshed.json()) as TokenResponse;
    }
  }

  try {
    const starter = await sessionStarter(req);
    const store = await cookies();
    await starter.createSessionFromPasswordlessVerify(
      { ...tokens, token_type: "Bearer", expires_in: Number(tokens.expires_in) },
      store,
      store,
    );
  } catch (error) {
    console.error("Password login could not start a session:", error);
    return NextResponse.json({ error: SIGN_IN_FAILED }, { status: 502 });
  }

  return new NextResponse(null, { status: 204 });
}
