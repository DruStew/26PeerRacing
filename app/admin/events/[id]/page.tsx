import Link from "next/link";
import { notFound } from "next/navigation";

import { EventScheduleForm } from "@/components/events/EventScheduleForm";
import { formatCalendarDate } from "@/lib/format-calendar-date";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function embedOne<T extends object>(v: T | T[] | null): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] as T | undefined) ?? null : v;
}

export default async function AdminEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: event, error: evError } = await supabase
    .from("events")
    .select(
      "id,name,city,state,timezone,race_date,end_date,event_type,status,results_published,created_at,promoter_id,artwork_url",
    )
    .eq("id", id)
    .maybeSingle();

  if (evError) {
    throw new Error(evError.message);
  }
  if (!event) {
    notFound();
  }

  const { data: promoter } = await supabase
    .from("profiles")
    .select("first_name,last_name,email,phone")
    .eq("id", event.promoter_id as string)
    .maybeSingle();

  const { data: distances } = await supabase
    .from("distances")
    .select("id,label,sort_order,pr_cutoff,entry_fee_cents")
    .eq("event_id", id)
    .order("sort_order", { ascending: true });

  const { data: rawEntries, error: entError } = await supabase
    .from("entries")
    .select(
      `
      id,
      distance_id,
      first_name,
      last_name,
      email,
      phone,
      bib,
      entry_kind,
      created_at,
      distances ( label )
    `,
    )
    .eq("event_id", id)
    .order("created_at", { ascending: true });

  if (entError) {
    throw new Error(entError.message);
  }

  const entries = rawEntries ?? [];

  const entrantsByDistanceId = new Map<string, number>();
  for (const row of entries) {
    const did = (row as { distance_id?: string | null }).distance_id;
    if (!did) continue;
    entrantsByDistanceId.set(did, (entrantsByDistanceId.get(did) ?? 0) + 1);
  }

  const promoterName = promoter
    ? [promoter.first_name, promoter.last_name].filter(Boolean).join(" ") ||
      promoter.email ||
      "—"
    : "—";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        <Link href="/admin/events" className="text-[#E87722] hover:underline">
          Events
        </Link>{" "}
        / Detail
      </p>
      <h1 className="font-display mt-2 text-balance text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        {event.name as string}
      </h1>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Race Info</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[#1E3A5F]/55">Race date</dt>
                <dd className="font-medium text-[#1E3A5F]">
                  {formatCalendarDate(event.race_date as string)}
                </dd>
              </div>
              <div>
                <dt className="text-[#1E3A5F]/55">Location</dt>
                <dd className="font-medium text-[#1E3A5F]">
                  {[event.city, event.state].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[#1E3A5F]/55">Status</dt>
                <dd className="font-medium capitalize text-[#1E3A5F]">{String(event.status)}</dd>
              </div>
              <div>
                <dt className="text-[#1E3A5F]/55">Event type</dt>
                <dd className="font-medium text-[#1E3A5F]">{String(event.event_type)}</dd>
              </div>
              <div>
                <dt className="text-[#1E3A5F]/55">Timezone</dt>
                <dd className="font-medium text-[#1E3A5F]">{String(event.timezone ?? "—")}</dd>
              </div>
              <div>
                <dt className="text-[#1E3A5F]/55">Results published</dt>
                <dd className="font-medium text-[#1E3A5F]">
                  {event.results_published ? "Yes" : "No"}
                </dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-[#1E3A5F]/10 pt-6">
              <h3 className="text-sm font-semibold text-[#1E3A5F]">Update Schedule</h3>
              <p className="mt-1 text-xs text-[#1E3A5F]/65">
                Race day and end date (e.g. postponement). Gun and entry deadlines: promoter editor → each
                distance.
              </p>
              <div className="mt-4">
                <EventScheduleForm
                  eventId={event.id as string}
                  raceDate={event.race_date as string}
                  endDate={(event as { end_date?: string | null }).end_date ?? null}
                  returnTo={`/admin/events/${id}`}
                  submitLabel="Save schedule"
                />
              </div>
            </div>

            <div className="mt-6 border-t border-[#1E3A5F]/10 pt-4">
              <h3 className="text-sm font-semibold text-[#1E3A5F]">Promoter</h3>
              <p className="mt-1 text-sm text-[#1E3A5F]/85">{promoterName}</p>
              {promoter?.email ? (
                <a
                  href={`mailto:${promoter.email}`}
                  className="mt-1 inline-block text-sm font-medium text-[#E87722] hover:underline"
                >
                  {promoter.email}
                </a>
              ) : null}
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Distances and Field</h2>
              <p className="text-xs text-[#1E3A5F]/60">
                Entry fee × entered = rough gross per distance (for payoff math).
              </p>
            </div>
            {(distances ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-[#1E3A5F]/65">No distances configured.</p>
            ) : (
              <>
                <div className="mt-4 overflow-x-auto rounded-lg border border-[#1E3A5F]/10">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-[#fafbfc] text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/70">
                      <tr>
                        <th className="px-3 py-2.5">Distance</th>
                        <th className="px-3 py-2.5">Entry fee</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Entered</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Est. gross</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E3A5F]/10 bg-white">
                      {(distances ?? []).map((d) => {
                        const did = d.id as string;
                        const n = entrantsByDistanceId.get(did) ?? 0;
                        const feeCents =
                          typeof d.entry_fee_cents === "number" ? d.entry_fee_cents : null;
                        const grossCents = feeCents != null ? n * feeCents : null;
                        return (
                          <tr key={did}>
                            <td className="px-3 py-3 font-medium text-[#1E3A5F]">{d.label as string}</td>
                            <td className="px-3 py-3 text-[#1E3A5F]/80">
                              {feeCents != null ? `$${(feeCents / 100).toFixed(2)}` : "—"}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#1E3A5F]">
                              {n}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-[#1E3A5F]/90">
                              {grossCents != null ? `$${(grossCents / 100).toFixed(2)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t border-[#1E3A5F]/15 bg-[#fafbfc] text-sm font-semibold text-[#1E3A5F]">
                      <tr>
                        <td className="px-3 py-2.5" colSpan={2}>
                          Totals (this table)
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {Array.from(entrantsByDistanceId.values()).reduce((a, b) => a + b, 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#1E3A5F]/85">
                          {(() => {
                            let sum = 0;
                            let any = false;
                            for (const d of distances ?? []) {
                              const did = d.id as string;
                              const n = entrantsByDistanceId.get(did) ?? 0;
                              const feeCents =
                                typeof d.entry_fee_cents === "number" ? d.entry_fee_cents : null;
                              if (feeCents != null) {
                                any = true;
                                sum += n * feeCents;
                              }
                            }
                            return any ? `$${(sum / 100).toFixed(2)}` : "—";
                          })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {entries.some((e) => !(e as { distance_id?: string | null }).distance_id) ? (
                  <p className="mt-2 text-xs text-amber-800/90">
                    Some entries have no distance assigned; they are not included in the per-distance
                    counts above.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <Link
            href={`/promoter/events/${id}/edit`}
            className="flex w-full items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-3 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
          >
            Open in promoter editor
          </Link>
          <Link
            href={`/events/${id}`}
            className="flex w-full items-center justify-center rounded-md bg-[#E87722] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
          >
            Public event page
          </Link>
        </aside>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">
          Entrants ({entries.length})
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-[#1E3A5F]/65">No entries for this event yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 shadow-sm">
            <table className="min-w-full divide-y divide-[#1E3A5F]/10 text-left text-sm">
              <thead className="bg-[#fafbfc] text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/70">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Distance</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Bib</th>
                  <th className="px-4 py-3">Kind</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E3A5F]/10 bg-white">
                {entries.map((row) => {
                  const dist = embedOne(
                    row.distances as { label: string } | { label: string }[] | null,
                  );
                  return (
                    <tr key={row.id as string} className="text-[#1E3A5F]/90">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {String(row.first_name)} {String(row.last_name)}
                      </td>
                      <td className="px-4 py-3">{dist?.label ?? "—"}</td>
                      <td className="max-w-[12rem] truncate px-4 py-3">
                        <a
                          href={`mailto:${row.email}`}
                          className="text-[#E87722] hover:underline"
                        >
                          {String(row.email)}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{String(row.phone)}</td>
                      <td className="px-4 py-3">{row.bib != null ? String(row.bib) : "—"}</td>
                      <td className="px-4 py-3 capitalize">{String(row.entry_kind)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-[#1E3A5F]/55">
          Bulk email/SMS to all entrants will live under Communications. Individual contact: use
          email or phone above.
        </p>
      </section>
    </main>
  );
}
