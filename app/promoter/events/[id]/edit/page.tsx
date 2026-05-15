import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { formatDateTimeLocal } from "@/lib/datetime-local";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { EventScheduleForm } from "@/components/events/EventScheduleForm";

import { EventArtworkSection } from "./EventArtworkSection";

const PAGE_SIZE = 10;

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

const selectClass = `${inputClass} cursor-pointer`;

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/edit`)}`);
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,city,state,race_date,gun_time,pr_cutoff,status,artwork_url")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const eventPromoterId = (event as { promoter_id?: string }).promoter_id;
  const isPromoter = data.user.id === eventPromoterId;
  const { data: adminRoleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", data.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!isPromoter && !adminRoleRow) {
    notFound();
  }

  const page = Math.max(1, Number(resolvedSearchParams.page ?? "1"));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: distancesSchedule } = await supabase
    .from("distances")
    .select("id,label,gun_time,pr_cutoff")
    .eq("event_id", id)
    .order("gun_time", { ascending: true, nullsFirst: true });

  const { data: distances } = await supabase
    .from("distances")
    .select("id,label,gun_time")
    .eq("event_id", id)
    .order("gun_time", { ascending: true, nullsFirst: true })
    .range(from, to);

  const { data: qualifierDistance } = await supabase
    .from("distances")
    .select("id,label")
    .eq("event_id", id)
    .eq("is_peer_racing_qualifier", true)
    .maybeSingle();

  const { count } = await supabase
    .from("distances")
    .select("id", { count: "exact", head: true })
    .eq("event_id", id);

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  const addDistance = async (formData: FormData) => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/edit`)}`);
    }

    const label = String(formData.get("label") ?? "").trim();
    const gunTimeRaw = String(formData.get("gun_time") ?? "").trim();
    const gunTime = gunTimeRaw ? new Date(gunTimeRaw).toISOString() : null;
    const prCutoffRaw = String(formData.get("pr_cutoff") ?? "").trim();
    const prCutoff = prCutoffRaw ? new Date(prCutoffRaw).toISOString() : null;
    const isQualifier = formData.get("is_peer_racing_qualifier") === "1";
    const allowRollOverFrom =
      String(formData.get("allow_roll_over_from_qualifier") ?? "").toLowerCase() === "yes";
    const allowQualifierRollOverHere =
      String(formData.get("allow_qualifier_split_to_roll_over_here") ?? "").toLowerCase() ===
      "yes";
    const allowPacers = formData.get("allow_pacers") === "1";
    const pacerFeeDollarsRaw = formData.get("pacer_fee_dollars");
    const pacerFeeCents = (() => {
      if (pacerFeeDollarsRaw == null || String(pacerFeeDollarsRaw).trim() === "") return 0;
      const d = parseFloat(String(pacerFeeDollarsRaw).replace(/[$,\s]/g, ""));
      if (Number.isNaN(d) || d < 0) return 0;
      return Math.round(d * 100);
    })();
    const entryFeeDollarsRaw = formData.get("entry_fee_dollars");
    const entryFeeCents = (() => {
      if (entryFeeDollarsRaw == null || String(entryFeeDollarsRaw).trim() === "") return 0;
      const d = parseFloat(String(entryFeeDollarsRaw).replace(/[$,\s]/g, ""));
      if (Number.isNaN(d) || d < 0) return 0;
      return Math.round(d * 100);
    })();

    const { error: insertError } = await supabase
      .from("distances")
      .insert({
        event_id: id,
        label,
        gun_time: gunTime,
        pr_cutoff: prCutoff,
        is_peer_racing_qualifier: isQualifier,
        allow_roll_over_from_qualifier: isQualifier && allowRollOverFrom,
        allow_qualifier_split_to_roll_over_here: !isQualifier && allowQualifierRollOverHere,
        allow_pacers: allowPacers,
        pacer_fee_cents: pacerFeeCents,
        entry_fee_cents: entryFeeCents,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    redirect(`/promoter/events/${id}/edit`);
  };

  const publishEvent = async () => {
    "use server";

    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/edit`)}`);
    }

    const { error: updateError } = await supabase
      .from("events")
      .update({ status: "published" })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    redirect(`/promoter/events/${id}/edit`);
  };

  const location = [event.city, event.state].filter(Boolean).join(", ") || "—";
  const published = event.status === "published";

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
        <Link
          href="/promoter"
          className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F]/70 transition-colors hover:text-[#E87722]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Promoter dashboard
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-b border-[#1E3A5F]/10 pb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
              Manage race
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
              {event.name}
            </h1>
            <p className="mt-2 text-sm text-[#1E3A5F]/75">{location}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {published ? (
                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-600/15">
                  Published
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-[#1E3A5F]/08 px-2.5 py-0.5 text-xs font-medium text-[#1E3A5F]/80 ring-1 ring-[#1E3A5F]/15">
                  {event.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
            <Link
              href={`/events/${event.id}`}
              className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
            >
              View public page
            </Link>
            <Link
              href={`/promoter/events/${id}/kiosk`}
              className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
            >
              Race day kiosk
            </Link>
            <Link
              href={`/promoter/events/${id}/payout`}
              className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
            >
              Payout calculator
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 text-sm text-[#1E3A5F]/80 sm:grid-cols-2">
          <div className="rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/50">Race day</p>
            <p className="mt-1 font-medium text-[#1E3A5F]">{formatCalendarDate(event.race_date)}</p>
            {(event as { end_date?: string | null }).end_date ? (
              <p className="mt-1 text-xs text-[#1E3A5F]/65">
                Ends {formatCalendarDate((event as { end_date?: string | null }).end_date)}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/50">
              Gun / entry deadline by distance
            </p>
            <div className="mt-1 text-[#1E3A5F]">
              {distancesSchedule && distancesSchedule.length > 0 ? (
                <ul className="space-y-2.5">
                  {distancesSchedule.map((row) => {
                    const gun = (row as { gun_time?: string | null }).gun_time;
                    const cutoff = (row as { pr_cutoff?: string | null }).pr_cutoff;
                    return (
                      <li key={row.id} className="text-sm leading-snug">
                        <span className="font-medium text-[#1E3A5F]">{row.label}</span>
                        <span className="text-[#1E3A5F]/80">
                          {" "}
                          — Gun {formatDateTimeLocal(gun ?? null)}
                          {" · "}
                          Entry deadline {formatDateTimeLocal(cutoff ?? null)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <span className="text-[#1E3A5F]/65">
                  Add distances below — each distance has its own gun time and entry deadline.
                </span>
              )}
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Update Schedule</h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/70">
            Change race day or multi-day end date (e.g. postponement). Gun and entry deadlines are set per
            distance below.
          </p>
          <div className="mt-5">
            <EventScheduleForm
              eventId={event.id}
              raceDate={event.race_date as string}
              endDate={(event as { end_date?: string | null }).end_date ?? null}
              returnTo={`/promoter/events/${id}/edit`}
            />
          </div>
        </section>

        <EventArtworkSection
          eventId={event.id}
          artworkUrl={(event as { artwork_url?: string | null }).artwork_url ?? null}
        />

        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Add Distance</h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/70">
            Add a race distance, fees, gun time and entry deadline, Qualifier rules, and pacer
            options.
          </p>

          <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6 shadow-sm sm:p-8">
            <form action={addDistance} className="space-y-5">
              <div>
                <label htmlFor="label" className="text-sm font-medium text-[#1E3A5F]">
                  Label
                </label>
                <input id="label" name="label" required className={inputClass} placeholder="5K" />
              </div>
              <div>
                <label htmlFor="entry_fee_dollars" className="text-sm font-medium text-[#1E3A5F]">
                  Entry fee ($)
                </label>
                <input
                  id="entry_fee_dollars"
                  name="entry_fee_dollars"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="gun_time" className="text-sm font-medium text-[#1E3A5F]">
                  Gun time <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
                </label>
                <input id="gun_time" name="gun_time" type="datetime-local" className={inputClass} />
              </div>
              <div>
                <label htmlFor="pr_cutoff" className="text-sm font-medium text-[#1E3A5F]">
                  Entry deadline <span className="font-normal text-[#1E3A5F]/55">(optional)</span>
                </label>
                <input
                  id="pr_cutoff"
                  name="pr_cutoff"
                  type="datetime-local"
                  className={inputClass}
                />
              </div>

              <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
                <p className="font-display text-base font-semibold text-[#1E3A5F]">
                  Peer Racing Qualifier
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#1E3A5F]/70">
                  You may have only one Qualifier per event. Runners can enter the Qualifier and
                  optionally roll their split to other races you allow below.
                </p>
                {qualifierDistance ? (
                  <div className="mt-4 space-y-4">
                    <p className="text-sm text-[#1E3A5F]">
                      This event&apos;s Peer Racing Qualifier is{" "}
                      <strong className="font-semibold">{qualifierDistance.label}</strong>.
                    </p>
                    <div>
                      <label
                        htmlFor="allow_qualifier_split_to_roll_over_here"
                        className="text-sm font-medium text-[#1E3A5F]"
                      >
                        Allow Qualifier split to roll over to this race?
                      </label>
                      <select
                        id="allow_qualifier_split_to_roll_over_here"
                        name="allow_qualifier_split_to_roll_over_here"
                        className={selectClass}
                        defaultValue="no"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-[#1E3A5F]">
                      <input
                        type="checkbox"
                        name="is_peer_racing_qualifier"
                        value="1"
                        className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                      />
                      This race is the Peer Racing Qualifier
                    </label>
                    <div>
                      <label
                        htmlFor="allow_roll_over_from_qualifier"
                        className="text-sm font-medium text-[#1E3A5F]"
                      >
                        Allow roll-over splits from this Qualifier?
                      </label>
                      <select
                        id="allow_roll_over_from_qualifier"
                        name="allow_roll_over_from_qualifier"
                        className={selectClass}
                        defaultValue="no"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-[#1E3A5F]/15 bg-white p-4 sm:p-5">
                <p className="font-display text-base font-semibold text-[#1E3A5F]">Pacers</p>
                <p className="mt-2 text-sm text-[#1E3A5F]/70">
                  Allow runners to request a registered Peer Racing member as pacer.
                </p>
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-[#1E3A5F]">
                  <input
                    type="checkbox"
                    name="allow_pacers"
                    value="1"
                    className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                  />
                  Allow pacers for this distance
                </label>
                <div className="mt-4">
                  <label htmlFor="pacer_fee_dollars" className="text-sm font-medium text-[#1E3A5F]">
                    Pacer Fee (in whole dollars. 0 if no pacer fee)
                  </label>
                  <input
                    id="pacer_fee_dollars"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    name="pacer_fee_dollars"
                    defaultValue="0"
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 sm:w-auto"
              >
                Add distance
              </button>
            </form>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Distances</h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/70">
            You may have one Peer Racing Qualifier Race but multiple “carry over” distances within.
            Runners may run the Qualifier race and enter the shorter distances and carryover their
            times on those specific distance splits.
          </p>

          <ul className="mt-6 space-y-3">
            {distances?.map((distance) => {
              const gun = (distance as { gun_time?: string | null }).gun_time;
              return (
                <li
                  key={distance.id}
                  className="flex flex-col gap-3 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-display text-lg font-semibold text-[#1E3A5F]">
                      {distance.label}
                    </p>
                    {gun ? (
                      <p className="mt-1 text-sm text-[#1E3A5F]/70">
                        Gun {formatDateTimeLocal(gun)}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href={`/promoter/events/${id}/distances/${distance.id}/edit`}
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                  >
                    Edit distance
                  </Link>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
              {page > 1 ? (
                <Link
                  href={`/promoter/events/${id}/edit?page=${page - 1}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[#1E3A5F]/20 px-4 py-2 text-sm font-medium text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </Link>
              ) : null}
              <span className="text-sm text-[#1E3A5F]/60">
                Page {page} of {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={`/promoter/events/${id}/edit?page=${page + 1}`}
                  className="inline-flex items-center gap-1 rounded-md border border-[#1E3A5F]/20 px-4 py-2 text-sm font-medium text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
                >
                  Next
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="mt-12 rounded-xl border border-[#E87722]/25 bg-[#fafbfc] p-6 sm:p-8">
          {published ? (
            <p className="text-sm font-medium text-emerald-800">
              This event is live on the public upcoming races list.
            </p>
          ) : (
            <p className="text-sm text-[#1E3A5F]/75">
              Publishing makes the event visible to runners on the public list (subject to your
              other settings).
            </p>
          )}
          <form action={publishEvent} className="mt-4">
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
            >
              {published ? "Publish again (refresh)" : "Publish event"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
