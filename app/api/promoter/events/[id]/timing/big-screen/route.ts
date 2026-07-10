import { NextResponse } from "next/server";

import { gateTimingApi } from "@/lib/timing/server";

export const dynamic = "force-dynamic";

/** PATCH { public: boolean } — toggle public visibility of the big-screen page. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await ctx.params;
  const gated = await gateTimingApi(request, eventId);
  if (!gated.ok) return gated.response;

  let body: { public?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { error } = await gated.service
    .from("events")
    .update({ big_screen_public: body.public === true })
    .eq("id", eventId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, public: body.public === true });
}
