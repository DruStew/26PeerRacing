import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * NTP-style clock reference. The capture page pings this several times,
 * keeps the sample with the lowest round-trip, and derives
 * offset = server_ms - (device send time + rtt/2).
 */
export async function GET() {
  return NextResponse.json(
    { server_ms: Date.now() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
