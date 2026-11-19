import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/auth/config";
import {
  PENDING_REGISTRATION_COOKIE,
  clearPendingRegistration,
  readPendingRegistration,
} from "@/lib/auth/pendingRegistration";
import { readAccessToken, readSessionClaims } from "@/lib/auth/session";

/**
 * Second half of registration, called once the OTP has been verified and has
 * signed the user in. Creates the password account from the details that
 * /api/auth/register/start stored, then discards them.
 */
export async function POST(req: NextRequest) {
  const pending = readPendingRegistration(req.cookies.get(PENDING_REGISTRATION_COOKIE)?.value);
  if (!pending) {
    return NextResponse.json(
      { error: "Your registration details have expired. Please go back and register again." },
      { status: 400 },
    );
  }

  // The details must belong to the address that was just verified, so a
  // stale cookie from another attempt can never register a different email.
  const claims = await readSessionClaims();
  const token = await readAccessToken();
  if (!claims || !token) {
    return NextResponse.json({ error: "Please verify your email first." }, { status: 401 });
  }
  if ((claims.email ?? "").toLowerCase() !== pending.email) {
    return NextResponse.json(
      { error: "This code was for a different email address. Please register again." },
      { status: 400 },
    );
  }

  const response = await fetch(`${backendUrl()}/settings/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role: pending.role, name: pending.fullName, password: pending.password }),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    const failure = (await response?.json().catch(() => null)) as { message?: string } | null;
    return NextResponse.json(
      { error: failure?.message || "We couldn't finish setting up your account. Please try again." },
      { status: response ? response.status : 502 },
    );
  }

  const result = new NextResponse(null, { status: 204 });
  clearPendingRegistration(result);
  return result;
}
