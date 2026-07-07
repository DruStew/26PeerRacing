import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { EVENT_ARTWORK_BUCKET, storagePathFromArtworkPublicUrl } from "@/lib/event-artwork";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const MAX_LOGO_BYTES = 3 * 1024 * 1024;
// Transparent-capable formats only — a JPEG sponsor logo is where "white
// boxes" come from, so we accept it but the UI pushes PNG/SVG/WebP.
const ALLOWED_LOGO_MIME = new Map<string, string>([
  ["image/png", "png"],
  ["image/svg+xml", "svg"],
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
]);

async function gate(eventId: string, supabase: SupabaseClient) {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: event, error } = await supabase
    .from("events")
    .select("id,promoter_id")
    .eq("id", eventId)
    .single();
  if (error || !event) {
    return { ok: false as const, response: NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 }) };
  }
  if ((event as { promoter_id: string }).promoter_id === uid) return { ok: true as const };
  const { data: admin } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", uid)
    .eq("role", "admin")
    .maybeSingle();
  if (admin) return { ok: true as const };
  return { ok: false as const, response: NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 }) };
}

/** POST — upload/replace this distance's share-graphic sponsor logo. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; distanceId: string }> },
) {
  const { id: eventId, distanceId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const { data: dist } = await service
    .from("distances")
    .select("id,share_sponsor_logo_url")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Choose a logo file." }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ ok: false, error: "Logo must be 3 MB or smaller." }, { status: 400 });
  }
  const ext = ALLOWED_LOGO_MIME.get(file.type);
  if (!ext) {
    return NextResponse.json(
      { ok: false, error: "Use a transparent PNG or SVG (WebP and JPEG also accepted)." },
      { status: 400 },
    );
  }

  const storagePath = `${eventId}/sponsor-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await service.storage
    .from(EVENT_ARTWORK_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });
  if (uploadErr) {
    return NextResponse.json({ ok: false, error: uploadErr.message }, { status: 500 });
  }

  const { data: pub } = service.storage.from(EVENT_ARTWORK_BUCKET).getPublicUrl(storagePath);

  const oldUrl = (dist as { share_sponsor_logo_url: string | null }).share_sponsor_logo_url;
  const { error: updateErr } = await service
    .from("distances")
    .update({ share_sponsor_logo_url: pub.publicUrl })
    .eq("id", distanceId);
  if (updateErr) {
    await service.storage.from(EVENT_ARTWORK_BUCKET).remove([storagePath]);
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  if (oldUrl) {
    const oldPath = storagePathFromArtworkPublicUrl(oldUrl);
    if (oldPath) await service.storage.from(EVENT_ARTWORK_BUCKET).remove([oldPath]);
  }

  return NextResponse.json({ ok: true, logo_url: pub.publicUrl });
}

/** DELETE — remove this distance's own logo (falls back to inheriting). */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; distanceId: string }> },
) {
  const { id: eventId, distanceId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const { data: dist } = await service
    .from("distances")
    .select("id,share_sponsor_logo_url")
    .eq("id", distanceId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!dist) {
    return NextResponse.json({ ok: false, error: "Distance not found for this event." }, { status: 404 });
  }

  const oldUrl = (dist as { share_sponsor_logo_url: string | null }).share_sponsor_logo_url;
  const { error } = await service
    .from("distances")
    .update({ share_sponsor_logo_url: null })
    .eq("id", distanceId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (oldUrl) {
    const oldPath = storagePathFromArtworkPublicUrl(oldUrl);
    if (oldPath) await service.storage.from(EVENT_ARTWORK_BUCKET).remove([oldPath]);
  }
  return NextResponse.json({ ok: true });
}
