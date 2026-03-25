import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isMembershipActive } from "@/lib/membership";

/**
 * Accept a pacer request: set pacer_user_id = current user, pacer_status = 'accepted'.
 * Requires active membership (same gate as enter race / create event).
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await context.params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "You must be signed in to act as a pacer" },
      { status: 401 },
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_start_at,membership_end_at")
    .eq("user_id", user.id)
    .single();

  if (!isMembershipActive(membership as { user_id: string; status: string; membership_start_at: string | null; membership_end_at: string | null } | null)) {
    return NextResponse.json(
      { ok: false, error: "Active membership required to act as a pacer", redirect: "/membership/renew" },
      { status: 403 },
    );
  }

  const { data: entry, error: fetchError } = await supabase
    .from("entries")
    .select("id,event_id,distance_id,pacer_status,pacer_user_id")
    .eq("id", entryId)
    .single();

  if (fetchError || !entry) {
    return NextResponse.json(
      { ok: false, error: "Entry not found" },
      { status: 404 },
    );
  }

  if ((entry as { pacer_status: string | null }).pacer_status !== "requested" || (entry as { pacer_user_id: string | null }).pacer_user_id != null) {
    return NextResponse.json(
      { ok: false, error: "This pacer request is no longer open" },
      { status: 409 },
    );
  }

  const { data: distance } = await supabase
    .from("distances")
    .select("id,allow_pacers")
    .eq("id", (entry as { distance_id: string }).distance_id)
    .single();

  if (!(distance as { allow_pacers?: boolean } | null)?.allow_pacers) {
    return NextResponse.json(
      { ok: false, error: "Pacers are not allowed for this distance" },
      { status: 403 },
    );
  }

  const { error: updateError } = await supabase
    .from("entries")
    .update({ pacer_user_id: user.id, pacer_status: "accepted" })
    .eq("id", entryId)
    .eq("pacer_status", "requested")
    .is("pacer_user_id", null);

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: updateError.message },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    eventId: (entry as { event_id: string }).event_id,
  });
}
