import { NextRequest, NextResponse } from "next/server";
import { backendUrl } from "@/lib/auth/config";
import { clientAddress, tooManyAttempts } from "@/lib/rateLimit";

/**
 * Whether a password account exists for an email, so the login form can tell
 * an unregistered user to register instead of showing "incorrect password".
 *
 * Rate-limited per address, because an open "does this email exist" endpoint
 * is otherwise an easy way to enumerate users.
 */

const MAX_CHECKS_PER_MINUTE = 20;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (tooManyAttempts(`account-status|${clientAddress(req.headers)}`, MAX_CHECKS_PER_MINUTE)) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
  }

  const response = await fetch(`${backendUrl()}/settings/account-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ error: "We couldn't check your account. Please try again." }, { status: 502 });
  }

  const result = (await response.json()) as { exists?: boolean };
  return NextResponse.json({ exists: result.exists === true });
}
