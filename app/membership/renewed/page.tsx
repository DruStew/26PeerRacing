import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE, MY_ENTRIES_ROUTE } from "@/lib/routes";
import { syncCheckoutSessionForUser } from "@/lib/stripe/sync-checkout-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MembershipRenewedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(DEFAULT_PUBLIC_ROUTE)}`);
  }

  const resolved = await searchParams;
  if (resolved.session_id) {
    try {
      await syncCheckoutSessionForUser(resolved.session_id, user.id);
    } catch {
      /* webhook may still process */
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Membership
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Welcome Back
        </h1>
        <p className="mt-3 text-pretty text-lg font-medium text-[#1E3A5F]/90">
          Membership renewed
        </p>
        <p className="mt-4 text-pretty text-sm leading-relaxed text-[#1E3A5F]/75">
          Thanks for renewing. You can keep registering for races and managing your entries.
        </p>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
          >
            Browse upcoming races
          </Link>
          <Link
            href={MY_ENTRIES_ROUTE}
            className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-6 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
          >
            My Entries
          </Link>
        </div>
      </main>
    </div>
  );
}
