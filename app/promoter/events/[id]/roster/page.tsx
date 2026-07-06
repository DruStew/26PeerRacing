import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { canManageEvent } from "@/lib/promoter/event-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

import { PromoterRosterClient } from "./PromoterRosterClient";

export const dynamic = "force-dynamic";

type EntryRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  distance_id: string;
  entry_type: string;
  entry_kind: string;
  paid_at: string | null;
  assigned_bib: string | null;
  kiosk_checked_in_at: string | null;
};

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  pr_id: string | null;
};

type RunnerGroup = {
  key: string;
  userId: string | null;
  entryId: string;
  entryIds: string[];
  name: string;
  email: string;
  phone: string;
  prId: string | null;
  raceDayBib: string | null;
  paid: boolean;
  distances: { label: string; checkedIn: boolean; entryType: string }[];
  fullyCheckedIn: boolean;
  anyCheckedIn: boolean;
};

export default async function EventRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/roster`)}`);
  }

  const { data: event, error } = await supabase.from("events").select("id,name,promoter_id,is_demo").eq("id", id).single();
  if (error || !event) notFound();

  if (!(await canManageEvent(supabase, auth.user.id, (event as { promoter_id?: string }).promoter_id))) {
    notFound();
  }

  const service = createServiceRoleSupabaseClient();
  if (!service) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY.");
  }

  const [{ data: distRaw }, { data: entriesRaw }] = await Promise.all([
    service.from("distances").select("id,label").eq("event_id", id).order("sort_order", { ascending: true }),
    service
      .from("entries")
      .select(
        "id,user_id,email,first_name,last_name,distance_id,entry_type,entry_kind,paid_at,assigned_bib,kiosk_checked_in_at",
      )
      .eq("event_id", id),
  ]);

  const distances = (distRaw ?? []) as { id: string; label: string | null }[];
  const distLabel = new Map(distances.map((d) => [d.id, d.label ?? "Race"]));
  const entries = (entriesRaw ?? []) as EntryRow[];

  const userIds = [...new Set(entries.map((e) => e.user_id).filter((u): u is string => Boolean(u)))];
  const profilesRes =
    userIds.length > 0
      ? await service.from("profiles").select("id,first_name,last_name,email,phone,pr_id").in("id", userIds)
      : { data: [] };
  const profiles = new Map(((profilesRes.data ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  // Group entries per runner (user_id, or email for legacy rows).
  const byRunner = new Map<string, EntryRow[]>();
  for (const e of entries) {
    const key = e.user_id ?? `em:${(e.email ?? "").trim().toLowerCase()}`;
    const list = byRunner.get(key) ?? [];
    list.push(e);
    byRunner.set(key, list);
  }

  const runners: RunnerGroup[] = [...byRunner.entries()].map(([key, list]) => {
    const prof = list[0].user_id ? profiles.get(list[0].user_id) : undefined;
    const name =
      `${prof?.first_name ?? list[0].first_name ?? ""} ${prof?.last_name ?? list[0].last_name ?? ""}`.trim() ||
      "(no name)";
    const dists = list
      .map((e) => ({
        label: distLabel.get(e.distance_id) ?? "Race",
        checkedIn: Boolean(e.kiosk_checked_in_at),
        entryType: e.entry_type,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {
      key,
      userId: list[0].user_id ?? null,
      entryId: list[0].id,
      entryIds: list.map((e) => e.id),
      name,
      email: prof?.email ?? list[0].email ?? "",
      phone: prof?.phone ?? "",
      prId: prof?.pr_id?.trim() || null,
      raceDayBib: list.map((e) => e.assigned_bib?.trim()).find((b) => b) ?? null,
      paid: list.some((e) => e.paid_at !== null || e.entry_kind === "comp"),
      distances: dists,
      fullyCheckedIn: dists.every((d) => d.checkedIn),
      anyCheckedIn: dists.some((d) => d.checkedIn),
    };
  });

  runners.sort((a, b) => a.name.localeCompare(b.name));

  const notCheckedIn = runners.filter((r) => !r.anyCheckedIn);
  const partial = runners.filter((r) => r.anyCheckedIn && !r.fullyCheckedIn);
  const checkedIn = runners.filter((r) => r.fullyCheckedIn);

  const perDistance = distances.map((d) => {
    const dEntries = entries.filter((e) => e.distance_id === d.id);
    return {
      label: d.label ?? "Race",
      total: dEntries.length,
      checkedIn: dEntries.filter((e) => e.kiosk_checked_in_at).length,
    };
  });

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <LandingNavbar />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href={`/promoter/events/${id}/edit`}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to event
        </Link>

        <EventNav eventId={id} current="roster" isDemo={(event as { is_demo?: boolean }).is_demo === true} />

        <div className="mt-6 border-b border-[#1E3A5F]/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Race day</p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Check-In Roster
          </h1>
          <p className="mt-2 text-sm text-[#1E3A5F]/75">{(event as { name: string }).name}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/70">
            Live snapshot of who&apos;s registered and checked in. Refresh the page or close a runner panel for the
            latest counts.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">Runners Registered</p>
            <p className="font-display mt-1 text-3xl font-bold text-[#1E3A5F]">{runners.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800/70">Checked In</p>
            <p className="font-display mt-1 text-3xl font-bold text-emerald-800">
              {checkedIn.length}
              {partial.length > 0 ? (
                <span className="ml-2 text-base font-semibold text-emerald-800/70">+{partial.length} partial</span>
              ) : null}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/70">Not Checked In</p>
            <p className="font-display mt-1 text-3xl font-bold text-amber-800">{notCheckedIn.length}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-[#1E3A5F]/75">
          {perDistance.map((d) => (
            <span key={d.label} className="rounded-full bg-white px-3 py-1 ring-1 ring-[#1E3A5F]/10">
              <span className="font-semibold text-[#1E3A5F]">{d.label}:</span> {d.checkedIn}/{d.total} entries checked
              in
            </span>
          ))}
        </div>

        <PromoterRosterClient
          eventId={id}
          notCheckedIn={notCheckedIn}
          partial={partial}
          checkedIn={checkedIn}
        />
      </main>
    </div>
  );
}
