import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isProfileComplete } from "@/lib/profile";
import { requireActiveMembership } from "@/lib/membership";
import { RaceSelectionAndCart } from "./RaceSelectionAndCart";

export default async function EnterEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; created_at?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const enterUrl = `/events/${id}/enter`;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(enterUrl)}`);
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,gun_time,pr_cutoff")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,dob,sex,phone,email")
    .eq("id", user.id)
    .single();

  if (!isProfileComplete(profile as { first_name: string | null; last_name: string | null; dob: string | null; sex: string | null; email: string | null } | null)) {
    redirect(`/profile/complete?returnUrl=${encodeURIComponent(enterUrl)}`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("user_id,status,membership_start_at,membership_end_at,welcome_shown_at,renewal_count")
    .eq("user_id", user.id)
    .single();
  requireActiveMembership(membership as { user_id: string; status: string; membership_start_at: string | null; membership_end_at: string | null; welcome_shown_at: string | null; renewal_count: number } | null, enterUrl);

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

  const showSuccess = resolvedSearchParams.success === "1";
  const phoneDisplay = user.phone ?? (profile as { phone?: string } | null)?.phone ?? user.email ?? "";

  return (
    <main style={{ padding: 24, maxWidth: 600 }}>
      <h1>Enter {event.name}</h1>
      <p>
        {event.city} {event.state} · {event.race_date}
      </p>
      <p>Signed in as {phoneDisplay}</p>

      {showSuccess ? (
        <div>
          <p>You&apos;re entered.</p>
          <p>Created at: {resolvedSearchParams.created_at}</p>
          <Link href={`/events/${event.id}`}>Back to event</Link>
        </div>
      ) : (
        <form id="enter-event-form" method="post" action={`/api/events/${id}/enter`}>
          {distances.length > 0 && (
            <fieldset style={{ marginBottom: 24, padding: 16, border: "1px solid #ccc" }}>
              <legend>Races (check at least one; order is by date/time)</legend>
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
              />
            </fieldset>
          )}

          <input type="hidden" name="first_name" value={(profile as { first_name?: string })?.first_name ?? ""} />
          <input type="hidden" name="last_name" value={(profile as { last_name?: string })?.last_name ?? ""} />
          <input type="hidden" name="phone" value={phoneDisplay} />
          <input type="hidden" name="email" value={(profile as { email?: string })?.email ?? user.email ?? ""} />
          <input type="hidden" name="dob" value={(profile as { dob?: string })?.dob ?? ""} />
          <input type="hidden" name="sex" value={(profile as { sex?: string })?.sex ?? ""} />

          <label htmlFor="bib">Bib (optional)</label>
          <input id="bib" name="bib" style={{ display: "block", marginBottom: 8 }} />

          <div style={{ marginTop: 16 }}>
            <button type="submit">Submit free entry</button>
          </div>
        </form>
      )}
    </main>
  );
}
