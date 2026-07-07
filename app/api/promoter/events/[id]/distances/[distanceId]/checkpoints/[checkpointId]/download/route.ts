import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkpointFileBase,
  renderCheckpointPng,
  renderCheckpointSvg,
} from "@/lib/checkpoints/qr-artwork";
import { originFromRequest } from "@/lib/checkpoints/shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

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

/** GET ?format=svg|png — print-ready checkpoint sign artwork. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; distanceId: string; checkpointId: string }> },
) {
  const { id: eventId, distanceId, checkpointId } = await ctx.params;
  const supabase = await createServerSupabaseClient();
  const gated = await gate(eventId, supabase);
  if (!gated.ok) return gated.response;

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json({ ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 503 });
  }

  const format = new URL(request.url).searchParams.get("format") === "png" ? "png" : "svg";

  const [{ data: event }, { data: distance }, { data: checkpoint }, { data: siblings }] =
    await Promise.all([
      service.from("events").select("name").eq("id", eventId).maybeSingle(),
      service
        .from("distances")
        .select("label,race_name")
        .eq("id", distanceId)
        .eq("event_id", eventId)
        .maybeSingle(),
      service
        .from("qr_checkpoints")
        .select("id,name,token,sort_order")
        .eq("id", checkpointId)
        .eq("distance_id", distanceId)
        .maybeSingle(),
      service
        .from("qr_checkpoints")
        .select("id")
        .eq("distance_id", distanceId)
        .order("sort_order", { ascending: true }),
    ]);

  if (!event || !distance || !checkpoint) {
    return NextResponse.json({ ok: false, error: "Checkpoint not found." }, { status: 404 });
  }

  const cp = checkpoint as { id: string; name: string; token: string };
  const number = ((siblings ?? []) as Array<{ id: string }>).findIndex((s) => s.id === cp.id) + 1;
  const dist = distance as { label: string; race_name: string | null };
  const distanceLabel = dist.race_name ? `${dist.race_name} — ${dist.label}` : dist.label;

  const svg = renderCheckpointSvg({
    url: `${originFromRequest(request)}/c/${cp.token}`,
    eventName: (event as { name: string }).name,
    distanceLabel,
    checkpointNumber: number || 1,
    checkpointName: cp.name,
  });

  const base = checkpointFileBase((event as { name: string }).name, dist.label, number || 1, cp.name);

  if (format === "png") {
    const png = await renderCheckpointPng(svg);
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${base}.png"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="${base}.svg"`,
      "Cache-Control": "no-store",
    },
  });
}
