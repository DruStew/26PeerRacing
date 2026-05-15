import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isProfileComplete, type ProfileRow } from "@/lib/profile";
import { requireActiveMembership, type MembershipRow } from "@/lib/membership";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { MY_ENTRIES_ROUTE, WALLET_ROUTE } from "@/lib/routes";
import { sumWalletBalanceCents } from "@/lib/wallet/balance";
import { formatUsdFromCents } from "@/lib/wallet/format-money";
import { RaceSelectionAndCart } from "./RaceSelectionAndCart";

export default async function EnterEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; created_at?: string; session_id?: string; canceled?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const enterUrl = `/events/${id}/enter`;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(enterUrl)}`);
  }

  if (resolvedSearchParams.success === "1" && resolvedSearchParams.session_id) {
    const { syncCheckoutSessionForUser } = await import("@/lib/stripe/sync-checkout-session");
    try {
      await syncCheckoutSessionForUser(resolvedSearchParams.session_id, user.id);
    } catch {
      /* webhook may still process */
    }
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,active_or_retired_military,phone,email")
    .eq("id", user.id)
    .single();

  if (!isProfileComplete(profile as ProfileRow | null)) {
    redirect(`/profile/complete?returnUrl=${encodeURIComponent(enterUrl)}`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", user.id)
    .single();
  requireActiveMembership(membership as MembershipRow | null, enterUrl);

  const { ensureBirthdayBenefit } = await import("@/lib/birthday-benefit");
  await ensureBirthdayBenefit(supabase, user.id, (profile as { dob?: string })?.dob ?? null, membership?.membership_end_at ?? null);

  const { data: distancesRaw } = await supabase
    .from("distances")
    .select("id,label,gun_time,sort_order,is_peer_racing_qualifier,allow_roll_over_from_qualifier,allow_qualifier_split_to_roll_over_here,allow_pacers,pacer_fee_cents,entry_fee_cents")
    .eq("event_id", id)
    .order("sort_order", { ascending: true, nullsFirst: true });

  const distances = (distancesRaw ?? []).slice().sort((a, b) => {
    const aTime = (a as { gun_time?: string }).gun_time ?? "";
    const bTime = (b as { gun_time?: string }).gun_time ?? "";
    if (aTime && bTime) return new Date(aTime).getTime() - new Date(bTime).getTime();
    if (aTime) return -1;
    if (bTime) return 1;
    return ((a as { sort_order?: number }).sort_order ?? 0) - ((b as { sort_order?: number }).sort_order ?? 0);
  });

  type D = (typeof distances)[number] & {
    is_peer_racing_qualifier?: boolean;
    allow_roll_over_from_qualifier?: boolean;
    allow_qualifier_split_to_roll_over_here?: boolean;
    allow_pacers?: boolean;
    pacer_fee_cents?: number;
    entry_fee_cents?: number;
  };
  const qualifier = distances.find(
    (d) => (d as D).is_peer_racing_qualifier && (d as D).allow_roll_over_from_qualifier,
  ) as D | undefined;
  const qualifierRollOverTargets = qualifier
    ? distances.filter(
        (d) => d.id !== qualifier.id && (d as D).allow_qualifier_split_to_roll_over_here,
      )
    : [];

  const hasPaidEntryFees = distances.some((d) => ((d as D).entry_fee_cents ?? 0) > 0);

  const walletBalanceCents = await sumWalletBalanceCents(supabase, user.id);

  const showSuccess = resolvedSearchParams.success === "1";
  const walletAfterEntryCents = showSuccess ? walletBalanceCents : null;
  const showCanceled = resolvedSearchParams.canceled === "1";
  const phoneDisplay =
    (profile as { phone?: string } | null)?.phone?.trim() ||
    user.phone ||
    user.email ||
    "";
  const location = [event.city, event.state].filter(Boolean).join(", ") || "—";

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <Link
          href={`/events/${event.id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Event details
        </Link>

        <header className="mt-6 border-b border-[#1E3A5F]/10 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
            Enter race
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            {event.name}
          </h1>
          <p className="mt-2 text-sm text-[#1E3A5F]/70">
            {location} · {formatCalendarDate(event.race_date)}
          </p>
          <p className="mt-3 text-sm text-[#1E3A5F]/80">
            Signed in as <span className="font-medium text-[#1E3A5F]">{phoneDisplay}</span>
          </p>
        </header>

        {showCanceled ? (
          <div
            className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            Checkout was canceled. You have not been charged. You can select races and try again.
          </div>
        ) : null}

        {showSuccess ? (
          <div className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 p-6 sm:p-8">
            <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E87722]/15">
                <svg className="h-8 w-8 text-[#E87722]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-display mt-4 text-xl font-semibold text-[#1E3A5F]">You&apos;re entered</h2>
              <p className="mt-2 text-sm text-[#1E3A5F]/70">
                Registered at: {resolvedSearchParams.created_at ?? "—"}
              </p>
              <p className="mt-3 text-sm font-medium text-[#1E3A5F]">
                Wallet balance: {formatUsdFromCents(walletBalanceCents)}
              </p>
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <Link
                  href={`/events/${event.id}`}
                  className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
                >
                  Back to event
                </Link>
                <Link
                  href={MY_ENTRIES_ROUTE}
                  className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/25 px-6 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                >
                  My entries
                </Link>
                <Link
                  href={WALLET_ROUTE}
                  className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/25 px-6 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                >
                  Wallet
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <form id="enter-event-form" method="post" action={`/api/events/${id}/enter`} className="mt-10">
            {distances.length > 0 && (
              <fieldset className="rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 p-4 sm:p-6">
                <legend className="font-display px-1 text-lg font-semibold text-[#1E3A5F]">
                  Races
                </legend>
                <p className="mb-4 text-sm text-[#1E3A5F]/70">
                  Choose at least one race. Order follows event schedule.
                </p>
                <RaceSelectionAndCart
                  formId="enter-event-form"
                  distances={distances.map((d) => ({
                    id: d.id,
                    label: d.label,
                    entry_fee_cents: (d as D).entry_fee_cents ?? 0,
                  }))}
                  qualifierId={qualifier?.id ?? null}
                  qualifierLabel={qualifier?.label ?? ""}
                  rollOverTargets={qualifierRollOverTargets.map((t) => ({
                    id: t.id,
                    label: t.label,
                    entry_fee_cents: (t as D).entry_fee_cents ?? 0,
                  }))}
                  gunTimes={Object.fromEntries(
                    distances
                      .filter((d) => (d as { gun_time?: string }).gun_time)
                      .map((d) => [d.id, new Date((d as { gun_time?: string }).gun_time!).toLocaleString()])
                  )}
                  walletBalanceCents={walletBalanceCents}
                />
              </fieldset>
            )}

            <input type="hidden" name="first_name" value={(profile as { first_name?: string })?.first_name ?? ""} />
            <input type="hidden" name="last_name" value={(profile as { last_name?: string })?.last_name ?? ""} />
            <input type="hidden" name="phone" value={phoneDisplay} />
            <input type="hidden" name="email" value={(profile as { email?: string })?.email ?? user.email ?? ""} />
            <input type="hidden" name="dob" value={(profile as { dob?: string })?.dob ?? ""} />
            <input type="hidden" name="sex" value={(profile as { sex?: string })?.sex ?? ""} />

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
              >
                {hasPaidEntryFees ? "Continue" : "Submit entry"}
              </button>
              <Link
                href={`/events/${event.id}`}
                className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-6 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
