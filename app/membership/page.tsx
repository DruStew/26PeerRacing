import Link from "next/link";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { MembershipTierPicker } from "@/components/membership/MembershipTierPicker";
import { resolveTierDescription } from "@/lib/membership-tier-config";
import { fetchMembershipTierConfigs } from "@/lib/membership-tier-config.server";
import { DEFAULT_PUBLIC_ROUTE, MEMBERSHIP_ACCOUNT_ROUTE } from "@/lib/routes";
import { membershipSubscriptionConfiguredAsync } from "@/lib/stripe/membership-prices";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MembershipPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tierConfigs = await fetchMembershipTierConfigs();
  const activeTiers = tierConfigs
    .filter((t) => t.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  const tiers = await Promise.all(
    activeTiers.map(async (t) => ({
      slug: t.slug,
      display_name: t.display_name,
      description: resolveTierDescription(t),
      price_cents: t.price_cents,
      rank: t.rank,
      is_paid: t.is_paid,
      checkout_enabled: t.is_paid ? await membershipSubscriptionConfiguredAsync(t.slug) : true,
    })),
  );

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Membership
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Choose Your Membership
        </h1>
        <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
          Every runner starts with a free Peer Racing account. Upgrade when you&apos;re ready to enter
          more races, host events, or unlock premium-only distances. Pick a plan below — we&apos;ll
          walk you through sign-in and checkout.
        </p>

        {user ? (
          <p className="mt-4 text-sm text-[#1E3A5F]/70">
            Signed in as <span className="font-medium text-[#1E3A5F]">{user.email}</span>.{" "}
            <Link
              href={MEMBERSHIP_ACCOUNT_ROUTE}
              className="font-medium text-[#E87722] underline-offset-2 hover:underline"
            >
              View your membership account
            </Link>
            .
          </p>
        ) : null}

        <section className="mt-10">
          <MembershipTierPicker tiers={tiers} mode="browse" signedIn={Boolean(user)} />
        </section>

        <section className="mt-12 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 sm:p-8">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">How it works</h2>
          <ol className="mt-4 space-y-3 text-sm leading-relaxed text-[#1E3A5F]/75">
            <li>
              <span className="font-semibold text-[#1E3A5F]">1. Pick a plan</span> — Free to browse
              and join open races, or choose a paid tier for full access.
            </li>
            <li>
              <span className="font-semibold text-[#1E3A5F]">2. Sign in or join</span> — We&apos;ll
              email you a magic link. No password required.
            </li>
            <li>
              <span className="font-semibold text-[#1E3A5F]">3. Complete checkout</span> — Paid
              memberships bill annually through Stripe and renew each year.
            </li>
          </ol>
        </section>

        <p className="mt-10 text-center text-sm text-[#1E3A5F]/70 sm:text-left">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 transition-colors hover:underline"
          >
            Browse upcoming races
          </Link>{" "}
          <span className="text-[#1E3A5F]/55">(browsing does not require a paid membership)</span>
        </p>
      </main>
    </div>
  );
}
