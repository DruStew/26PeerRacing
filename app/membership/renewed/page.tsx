import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE, MY_ENTRIES_ROUTE } from "@/lib/routes";
import { syncCheckoutSessionForUser } from "@/lib/stripe/sync-checkout-session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function MembershipRenewedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; returnUrl?: string }>;
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

  const returnUrl = resolved.returnUrl?.startsWith("/") ? resolved.returnUrl : null;
  const continueIsRaceEntry = Boolean(returnUrl && returnUrl.includes("/enter"));

  const { data: profileRaw } = await supabase.from("profiles").select("pr_id").eq("id", user.id).maybeSingle();
  const prId = (profileRaw as { pr_id?: string | null } | null)?.pr_id?.trim() || null;

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
          Membership Renewed
        </p>
        <p className="mt-4 text-pretty text-sm leading-relaxed text-[#1E3A5F]/75">
          Thanks for renewing. You can keep registering for races and managing your entries.
        </p>

        {prId ? (
          <div className="mt-6 rounded-xl bg-[#1E3A5F] px-6 py-5 text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Your Peer Racing ID</p>
            <p className="font-display mt-1 text-4xl font-bold tracking-tight text-[#E87722]">PR&nbsp;{prId}</p>
            <p className="mt-2 text-sm text-white/75">
              Your lifetime number — it follows you to every Peer Racing start line.
            </p>
          </div>
        ) : null}

        {returnUrl ? (
          <div className="mt-6 rounded-xl border border-[#E87722]/30 bg-[#fff9f5] px-5 py-4">
            <p className="text-sm font-medium text-[#1E3A5F]/85">
              {continueIsRaceEntry
                ? "Your membership is active — one more step to finish your race entry."
                : "Your membership is active — pick up where you left off."}
            </p>
            <Link
              href={returnUrl}
              className="mt-3 inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
            >
              {continueIsRaceEntry ? "Continue to race entry" : "Continue"}
            </Link>
          </div>
        ) : null}

        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className={
              returnUrl
                ? "inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-6 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                : "inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
            }
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
