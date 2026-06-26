import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { courseLengthMeters, type CourseGeoJSON } from "@/lib/mapbox/config";

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

function isValidCourse(value: unknown): value is CourseGeoJSON {
  if (!value || typeof value !== "object") return false;
  const fc = value as { type?: string; features?: unknown };
  if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) return false;
  return fc.features.every((f) => {
    const feat = f as { geometry?: { type?: string; coordinates?: unknown } };
    return feat.geometry?.type === "LineString" && Array.isArray(feat.geometry.coordinates);
  });
}

export async function PUT(
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

  let body: { course_geojson?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const raw = body.course_geojson;
  // Empty/cleared course is allowed (null).
  const isEmpty =
    raw == null ||
    (typeof raw === "object" &&
      Array.isArray((raw as { features?: unknown[] }).features) &&
      (raw as { features: unknown[] }).features.length === 0);

  if (!isEmpty && !isValidCourse(raw)) {
    return NextResponse.json(
      { ok: false, error: "Course must be a GeoJSON FeatureCollection of LineStrings." },
      { status: 400 },
    );
  }

  const course = isEmpty ? null : (raw as CourseGeoJSON);
  const lengthMeters = course ? Math.round(courseLengthMeters(course)) : null;

  const { error } = await service
    .from("distances")
    .update({
      course_geojson: course,
      course_distance_meters: lengthMeters,
    })
    .eq("id", distanceId)
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, course_distance_meters: lengthMeters });
}
