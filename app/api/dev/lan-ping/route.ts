import { NextResponse } from "next/server";

/** Dev-only: hit from a phone browser to confirm LAN traffic reaches this PC. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown";

  console.log(`[dev-access] LAN ping from ${ip}`);

  return NextResponse.json({
    ok: true,
    message: "Your phone reached the dev server.",
    clientIp: ip,
    at: new Date().toISOString(),
  });
}
