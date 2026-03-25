import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Renew membership: set membership_end_at = now + 1 year, increment renewal_count.
 * TODO: Stripe subscription integration – replace free renewal with subscription checkout.
 * TODO: Payment webhooks placeholder – on subscription renewed, extend membership_end_at.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const now = new Date();
  const oneYearLater = new Date(now);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);

  const { data: current } = await supabase
    .from("memberships")
    .select("renewal_count,membership_end_at")
    .eq("user_id", user.id)
    .single();

  if (!current) {
    const { error: insertError } = await supabase.from("memberships").insert({
      user_id: user.id,
      status: "active",
      membership_start_at: now.toISOString(),
      membership_end_at: oneYearLater.toISOString(),
      renewal_count: 0,
      updated_at: now.toISOString(),
    });
    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const nextCount = (current.renewal_count ?? 0) + 1;
  const { error } = await supabase
    .from("memberships")
    .update({
      membership_end_at: oneYearLater.toISOString(),
      renewal_count: nextCount,
      updated_at: now.toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
