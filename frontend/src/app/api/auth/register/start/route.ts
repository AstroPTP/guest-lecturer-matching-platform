import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { storePendingRegistration } from "@/lib/auth/pendingRegistration";
import { clientAddress, tooManyAttempts } from "@/lib/rateLimit";

/**
 * First half of registration: sends the email OTP and keeps the details for
 * /api/auth/register/complete, in an encrypted HttpOnly cookie rather than in
 * the browser's reach.
 */

const MAX_ATTEMPTS_PER_MINUTE = 5;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const role = body?.role === "coordinator" ? "coordinator" : body?.role === "guest" ? "guest" : null;

  // The backend applies the same limits when the account is created; checking
  // here saves the user an OTP round trip that could only end in a rejection.
  if (!email || !fullName || fullName.length > 200 || password.length < 8 || password.length > 1024 || !role) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  if (tooManyAttempts(`register|${clientAddress(req.headers)}`, MAX_ATTEMPTS_PER_MINUTE)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  }

  try {
    await auth0.passwordless.start({ connection: "email", email, send: "code" });
  } catch {
    return NextResponse.json({ error: "Could not send the verification code. Try again." }, { status: 500 });
  }

  const response = new NextResponse(null, { status: 204 });
  storePendingRegistration(response, { email, fullName, password, role });
  return response;
}
