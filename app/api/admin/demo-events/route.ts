import { NextResponse } from "next/server";

import { isSuperAdmin } from "@/lib/demo/event";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET — list demo events (super admin). */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isSuperAdmin(supabase, auth.user.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data: events, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,created_at,status")
    .eq("is_demo", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, events: events ?? [] });
}

/** POST — create a demo sandbox event (super admin). */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(await isSuperAdmin(supabase, auth.user.id))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: {
    name?: string;
    city?: string | null;
    state?: string | null;
    race_date?: string;
    end_date?: string | null;
    event_type?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const raceDate = String(body.race_date ?? "").trim();
  const eventType = String(body.event_type ?? "full").trim();
  if (!name || !raceDate) {
    return NextResponse.json({ ok: false, error: "Provide name and race_date." }, { status: 400 });
  }
  if (!["full", "overlay"].includes(eventType)) {
    return NextResponse.json({ ok: false, error: "Invalid event_type." }, { status: 400 });
  }

  const insertPayload: Record<string, unknown> = {
    promoter_id: auth.user.id,
    name,
    city: body.city?.trim() || null,
    state: body.state?.trim() || null,
    race_date: raceDate,
    event_type: eventType,
    status: "draft",
    is_demo: true,
  };
  const endDate = body.end_date?.trim();
  if (endDate) insertPayload.end_date = endDate;

  const { data: created, error } = await supabase
    .from("events")
    .insert(insertPayload)
    .select("id,name")
    .single();

  if (error || !created) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Could not create demo event." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    event: created,
    editUrl: `/promoter/events/${(created as { id: string }).id}/edit`,
  });
}
