import { NextResponse } from "next/server";

import { originFromRequest } from "@/lib/checkpoints/shared";
import { getOrCreateConnectAccount } from "@/lib/stripe/connect";
import { getStripe } from "@/lib/stripe/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

/**
 * POST — start (or resume) Stripe Connect Express onboarding for the current
 * user and return the hosted onboarding URL. Safe to call repeatedly: an
 * incomplete account just gets a fresh onboarding link.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to set up payouts." }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 503 });
  }
  const service = createServiceRoleSupabaseClient();
  if (!service) {
    return NextResponse.json(
      { ok: false, error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
      { status: 503 },
    );
  }

  try {
    const account = await getOrCreateConnectAccount(service, stripe, user.id, user.email ?? null);
    const origin = originFromRequest(request);
    const link = await stripe.accountLinks.create({
      account: account.stripe_account_id,
      type: "account_onboarding",
      refresh_url: `${origin}/wallet?connect=refresh`,
      return_url: `${origin}/wallet?connect=return`,
    });
    return NextResponse.json({ ok: true, url: link.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not start Stripe onboarding.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
