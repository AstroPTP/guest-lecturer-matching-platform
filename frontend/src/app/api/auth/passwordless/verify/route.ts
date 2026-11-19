import { NextRequest, NextResponse } from "next/server";
import { PasswordlessVerifyError } from "@auth0/nextjs-auth0/errors";
import { auth0 } from "@/lib/auth0";

/**
 * Checks an emailed OTP. On success the SDK writes a session cookie, so the
 * caller is signed in and can finish registration or reset their password.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const verificationCode = typeof body?.verificationCode === "string" ? body.verificationCode.trim() : "";

  if (!email || !verificationCode) {
    return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
  }

  try {
    await auth0.passwordless.verify({ connection: "email", email, verificationCode });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // A wrong or expired code is the user's to fix. Anything else is ours, so
    // it is logged and reported as a retryable failure rather than as a bad
    // code, which would send the user round in circles.
    if (error instanceof PasswordlessVerifyError && error.error === "invalid_grant") {
      return NextResponse.json({ error: "Invalid verification code. Please try again." }, { status: 400 });
    }
    console.error(
      "Passwordless verify failed:",
      error instanceof PasswordlessVerifyError ? `${error.error}: ${error.error_description}` : error,
    );
    return NextResponse.json({ error: "We couldn't verify your code right now. Please try again." }, { status: 502 });
  }
}
