import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const verificationCode = typeof body?.verificationCode === "string" ? body.verificationCode.trim() : "";

  if (!email || !verificationCode) {
    return NextResponse.json({ error: "Email and code are required." }, { status: 400 });
  }

  try {
    await auth0.passwordless.verify({ connection: "email", email, verificationCode });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 });
  }
}
