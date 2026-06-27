import { NextResponse } from "next/server";

import { sendPeerRacingMagicLink } from "@/lib/auth/send-magic-link-email";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";

export async function POST(request: Request) {
  let body: { email?: string; returnUrl?: string };
  try {
    body = (await request.json()) as { email?: string; returnUrl?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const rawReturn = body.returnUrl ?? DEFAULT_PUBLIC_ROUTE;
  const returnUrl =
    typeof rawReturn === "string" && rawReturn.startsWith("/") && !rawReturn.startsWith("//")
      ? rawReturn
      : DEFAULT_PUBLIC_ROUTE;

  const origin = new URL(request.url).origin;
  const result = await sendPeerRacingMagicLink({ email, origin, returnUrl });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
