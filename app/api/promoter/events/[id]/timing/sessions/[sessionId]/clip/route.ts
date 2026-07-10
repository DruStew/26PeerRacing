import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

const MAX_CLIP_BYTES = 30 * 1024 * 1024;

/**
 * POST — attach a crossing clip (extracted from the Finish Cam rolling
 * buffer) to its finish event. The capture page links them with the
 * client_key it stamped on the crossing; if the event hasn't synced yet the
 * response says retry and the phone tries again shortly.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { id: eventId, sessionId } = await ctx.params;
  const gated = await gateTimingApi(request, eventId);
  if (!gated.ok) return gated.response;
  const service = gated.service;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart form data." }, { status: 400 });
  }

  let clientKeys: string[] = [];
  try {
    const parsed = JSON.parse(String(form.get("client_keys") ?? "[]")) as unknown;
    if (Array.isArray(parsed)) clientKeys = parsed.map((k) => String(k)).filter(Boolean).slice(0, 50);
  } catch {
    // fall through to validation below
  }
  const clipStartMs = Number(form.get("clip_start_ms"));
  const file = form.get("file");
  if (clientKeys.length === 0 || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "Provide client_keys and file." }, { status: 400 });
  }
  if (file.size > MAX_CLIP_BYTES) {
    return NextResponse.json({ ok: false, error: "Clip too large." }, { status: 413 });
  }

  // Crossings this segment covers (synced from the outbox — some may lag).
  const { data: fes } = await service
    .from("timing_finish_events")
    .select("id,detail")
    .eq("session_id", sessionId)
    .eq("event_id", eventId)
    .in("detail->>client_key", clientKeys);
  const rows = (fes ?? []) as { id: string; detail: Record<string, unknown> }[];
  if (rows.length === 0) {
    // None synced yet — tell the phone to retry the whole batch.
    return NextResponse.json({ ok: false, retry: true, matched_keys: [] }, { status: 404 });
  }

  const isMp4 = (file.type || "").includes("mp4");
  // One stored object per segment; every crossing inside it points at the same file.
  const segmentKey = String(form.get("segment_id") ?? crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g, "");
  const path = `${eventId}/${sessionId}/${segmentKey}.${isMp4 ? "mp4" : "webm"}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await service.storage.from("finish-clips").upload(path, buffer, {
    contentType: file.type || "video/webm",
    upsert: true,
  });
  if (upErr) return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });

  const matchedKeys: string[] = [];
  for (const feRow of rows) {
    const key = String((feRow.detail as { client_key?: string }).client_key ?? "");
    matchedKeys.push(key);
    await service
      .from("timing_finish_events")
      .update({
        detail: {
          ...feRow.detail,
          clip_path: path,
          clip_start_ms: Number.isFinite(clipStartMs) ? Math.round(clipStartMs) : null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", feRow.id);
  }

  return NextResponse.json({ ok: true, matched_keys: matchedKeys });
}
