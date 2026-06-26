import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EVENT_ARTWORK_BUCKET,
  storagePathFromArtworkPublicUrl,
} from "@/lib/event-artwork";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

async function gate(eventId: string, supabase: SupabaseClient) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,promoter_id,artwork_url")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 }),
    };
  }

  if (!(await canManageEvent(supabase, uid, (event as { promoter_id: string }).promoter_id))) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, event: event as { id: string; name: string; artwork_url: string | null } };
}

/**
 * DELETE { confirm_name: string }
 * Permanently deletes an event and all related data (cascades).
 */
export async function DELETE(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  let body: { confirm_name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const confirmName = String(body.confirm_name ?? "").trim();
  if (!confirmName || confirmName !== gated.event.name.trim()) {
    return NextResponse.json(
      { ok: false, error: "Confirmation name does not match the event name." },
      { status: 400 },
    );
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  const artworkUrl = gated.event.artwork_url;
  if (artworkUrl) {
    const path = storagePathFromArtworkPublicUrl(artworkUrl);
    if (path) {
      await service.storage.from(EVENT_ARTWORK_BUCKET).remove([path]);
    }
  }

  // Delete via service role after gate — RLS delete policies are stricter than
  // edit-page access (e.g. promoter_id without a roles row), and a blocked
  // client delete returns success with zero rows removed.
  const { data: deleted, error: delErr } = await service
    .from("events")
    .delete()
    .eq("id", eventId)
    .select("id");

  if (delErr) {
    return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  }
  if (!deleted?.length) {
    return NextResponse.json({ ok: false, error: "Event could not be deleted." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
