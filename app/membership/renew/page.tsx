import Link from "next/link";
import { redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";
import { isMembershipActive, membershipTierFromRow, type MembershipRow } from "@/lib/membership";
import { MEMBERSHIP_TIER_LABELS } from "@/lib/membership-tiers";
import {
  anyPaidMembershipCheckoutConfiguredAsync,
  membershipSubscriptionConfiguredAsync,
} from "@/lib/stripe/membership-prices";
import { tierLabelFromConfig } from "@/lib/membership-tier-config";
import { fetchMembershipTierConfigs } from "@/lib/membership-tier-config.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { formatCalendarDate } from "@/lib/format-calendar-date";

import { RenewMembershipForm } from "./RenewMembershipForm";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMoneyCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

type ProfileRow = {
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  sex: string | null;
  phone: string | null;
  email: string | null;
  hometown: string | null;
  home_state: string | null;
  zip: string | null;
  created_at: string | null;
  pr_id: string | null;
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-[#1E3A5F]/10 py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-sm font-medium text-[#1E3A5F]/65">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-[#1E3A5F] sm:text-right">{value}</dd>
    </div>
  );
}

export default async function MembershipRenewPage({
  searchParams,
}: {
  searchParams: Promise<{ returnUrl?: string; canceled?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const resolved = await searchParams;
    redirect(`/login?returnUrl=${encodeURIComponent(resolved.returnUrl ?? "/membership/renew")}`);
  }

  const resolved = await searchParams;
  const showCheckoutCanceled = resolved.canceled === "1";

  const { data: membershipRaw } = await supabase
    .from("memberships")
    .select(
      "user_id,status,tier,membership_start_at,membership_end_at,renewal_count,welcome_shown_at,updated_at,provider,provider_customer_id,created_at,stripe_subscription_id",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const membership = membershipRaw as MembershipRow & {
    provider?: string | null;
    provider_customer_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  } | null;

  const { data: profileRaw } = await supabase
    .from("profiles")
    .select("first_name,last_name,dob,sex,phone,email,hometown,home_state,zip,created_at,pr_id")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileRaw as ProfileRow | null;

  const { data: benefits } = await supabase
    .from("membership_benefits")
    .select(
      "id,benefit_type,total_amount_cents,remaining_amount_cents,status,available_from,expires_at,membership_year_reference",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const active = membership ? isMembershipActive(membership) : false;
  const currentTier = membershipTierFromRow(membership);
  const tierConfigs = await fetchMembershipTierConfigs();
  const tierLabel =
    tierLabelFromConfig(tierConfigs, currentTier) ||
    MEMBERSHIP_TIER_LABELS[currentTier as keyof typeof MEMBERSHIP_TIER_LABELS] ||
    currentTier;

  const paidTierRows = tierConfigs.filter((t) => t.is_active && t.is_paid);
  const paidTiers = await Promise.all(
    paidTierRows.map(async (t) => ({
      slug: t.slug,
      display_name: t.display_name,
      price_usd: t.price_cents / 100,
      checkout_enabled: await membershipSubscriptionConfiguredAsync(t.slug),
    })),
  );
  const showDevFree = !(await anyPaidMembershipCheckoutConfiguredAsync());
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  const authEmail = user.email ?? "";
  const profileEmail = profile?.email?.trim() ?? "";
  const emailDisplay =
    profileEmail && profileEmail !== authEmail
      ? `${profileEmail} (account: ${authEmail || "—"})`
      : authEmail || profileEmail || "—";
  const phoneDisplay = profile?.phone?.trim() || user.phone || "—";

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Membership
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
          Renew Membership
        </h1>
        <p className="mt-3 text-pretty text-[#1E3A5F]/75">
          Review your account and membership below. Renew to create events, enter races, and act as
          a pacer. Renewal extends your membership by one year.
        </p>

        {profile?.pr_id?.trim() ? (
          <section className="mt-8 overflow-hidden rounded-xl border border-[#1E3A5F]/15 bg-[#1E3A5F] p-6 text-white shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">
                  Your Peer Racing ID
                </p>
                <p className="font-display mt-1 text-5xl font-bold tracking-tight text-[#E87722]">
                  PR&nbsp;{profile.pr_id.trim()}
                </p>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-white/75">
                Your lifetime number — it follows you to every Peer Racing start line. Give it at
                check-in or anytime someone asks for your bib.
              </p>
            </div>
          </section>
        ) : null}

        <section className="mt-10 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Your Profile</h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/65">Information from your Peer Racing profile.</p>
          <dl className="mt-5">
            <InfoRow label="Name" value={displayName || "—"} />
            <InfoRow label="Email" value={emailDisplay} />
            <InfoRow label="Phone" value={phoneDisplay} />
            <InfoRow
              label="Date of birth"
              value={formatCalendarDate(profile?.dob ?? null)}
            />
            <InfoRow label="Hometown" value={profile?.hometown?.trim() || "—"} />
            <InfoRow label="State" value={profile?.home_state?.trim() || "—"} />
            <InfoRow label="ZIP code" value={profile?.zip?.trim() || "—"} />
            <InfoRow
              label="Sex"
              value={
                profile?.sex === "male"
                  ? "Male"
                  : profile?.sex === "female"
                    ? "Female"
                    : profile?.sex
                      ? String(profile.sex)
                      : "—"
              }
            />
            <InfoRow
              label="Profile created"
              value={formatDateTime(profile?.created_at ?? null)}
            />
          </dl>
          <p className="mt-4 text-sm text-[#1E3A5F]/60">
            To update your profile,{" "}
            <Link
              href={`/profile/complete?returnUrl=${encodeURIComponent("/membership/renew")}`}
              className="font-medium text-[#E87722] underline-offset-2 hover:underline"
            >
              complete or edit your profile
            </Link>
            .
          </p>
        </section>

        <section className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
                Membership Details
              </h2>
              <p className="mt-1 text-sm text-[#1E3A5F]/65">Your current membership record.</p>
            </div>
            {membership ? (
              <span
                className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                  active
                    ? "bg-emerald-50 text-emerald-800 ring-emerald-600/20"
                    : "bg-[#1E3A5F]/08 text-[#1E3A5F]/85 ring-[#1E3A5F]/15"
                }`}
              >
                {active ? "Active" : membership.status === "expired" ? "Expired" : membership.status}
              </span>
            ) : null}
          </div>

          {membership ? (
            <dl className="mt-5">
              <InfoRow label="User ID" value={membership.user_id} />
              <InfoRow label="Tier" value={tierLabel} />
              <InfoRow label="Status" value={membership.status} />
              <InfoRow
                label="Current period start"
                value={formatDateTime(membership.membership_start_at)}
              />
              <InfoRow
                label="Current period end"
                value={formatDateTime(membership.membership_end_at)}
              />
              <InfoRow label="Renewal count" value={String(membership.renewal_count)} />
              <InfoRow
                label="Welcome flow"
                value={
                  membership.welcome_shown_at
                    ? `Completed ${formatDateTime(membership.welcome_shown_at)}`
                    : "Not completed yet"
                }
              />
              <InfoRow
                label="Record created"
                value={formatDateTime(membership.created_at ?? null)}
              />
              <InfoRow
                label="Last updated"
                value={formatDateTime(membership.updated_at ?? null)}
              />
              <InfoRow
                label="Billing provider"
                value={membership.provider?.trim() || "—"}
              />
              <InfoRow
                label="Provider customer ID"
                value={membership.provider_customer_id?.trim() || "—"}
              />
            </dl>
          ) : (
            <p className="mt-5 text-sm text-[#1E3A5F]/70">
              No membership record found yet. You can start one below.
            </p>
          )}
        </section>

        {benefits && benefits.length > 0 ? (
          <section className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
              Membership Benefits
            </h2>
            <p className="mt-1 text-sm text-[#1E3A5F]/65">
              Credits and perks tied to your membership.
            </p>
            <ul className="mt-4 space-y-4">
              {benefits.map((b) => (
                <li
                  key={(b as { id: string }).id}
                  className="rounded-lg border border-[#1E3A5F]/10 bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium capitalize text-[#1E3A5F]">
                      {String(b.benefit_type).replace(/_/g, " ")}
                    </span>
                    <span className="rounded-md bg-[#1E3A5F]/08 px-2 py-0.5 text-xs font-medium text-[#1E3A5F]/80">
                      {b.status}
                    </span>
                  </div>
                  <p className="mt-2 text-[#1E3A5F]/75">
                    Remaining {formatMoneyCents(b.remaining_amount_cents)} of{" "}
                    {formatMoneyCents(b.total_amount_cents)}
                  </p>
                  <p className="mt-1 text-xs text-[#1E3A5F]/55">
                    Available {formatDateTime(b.available_from)} · Expires{" "}
                    {formatDateTime(b.expires_at)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 rounded-xl border border-[#E87722]/25 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Membership Plan</h2>
          {showCheckoutCanceled ? (
            <div
              className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="status"
            >
              Checkout was canceled. You have not been charged. You can try again when you are ready.
            </div>
          ) : null}
          <div className="mt-6">
            <RenewMembershipForm
              returnUrl={resolved.returnUrl?.startsWith("/") ? resolved.returnUrl : null}
              currentTier={currentTier}
              paidTiers={paidTiers}
              showDevFree={showDevFree}
            />
          </div>
        </section>

        <p className="mt-10 text-center text-sm text-[#1E3A5F]/70 sm:text-left">
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="font-medium text-[#E87722] underline-offset-2 transition-colors hover:underline"
          >
            Browse events
          </Link>{" "}
          <span className="text-[#1E3A5F]/55">(browsing races does not require membership)</span>
        </p>
      </main>
    </div>
  );
}
