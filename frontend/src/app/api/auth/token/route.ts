import { auth0 } from "@/lib/auth0";
import { NextResponse } from "next/server";

export async function GET() {
    const session = await auth0.getSession();
    console.log("SESSION:", JSON.stringify(session, null, 2));
    return NextResponse.json({ accessToken: session?.tokenSet?.accessToken ?? null });
}