import { NextResponse } from "next/server";

import { getKioskSessionFromCookies } from "@/lib/kiosk/parse-session-cookie";
import { getServiceOrThrow } from "@/lib/kiosk/ensure-kiosk-row";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let admin;
  try {
    admin = getServiceOrThrow();
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }

  const session = await getKioskSessionFromCookies(admin, request.headers.get("cookie"));
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  await admin
    .from("event_kiosk_terminal")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", session.terminal.id);

  return NextResponse.json({ ok: true });
}
