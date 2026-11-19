import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  try {
    await auth0.passwordless.start({ connection: "email", email, send: "code" });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Could not send the code. Try again." }, { status: 500 });
  }
}
