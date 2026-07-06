import { formatDistanceDisplay } from "@/lib/distance-display";
import {
  effectiveCheckInWindow,
  effectiveWalkUpFeeCents,
  hasCustomStartLocation,
  walkUpsAllowed,
  type AidStationRow,
  type DistanceLogistics,
} from "@/lib/race-day/logistics";

export type RaceDaySheetDistance = DistanceLogistics & {
  id: string;
  label: string;
  race_name?: string | null;
  results_published_at?: string | null;
  aidStations: AidStationRow[];
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDayTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Check-in window rendered compactly; spans days get day labels. */
function checkInLabel(opensAt: string | null, closesAt: string | null): string | null {
  if (!opensAt && !closesAt) return null;
  const sameDay =
    opensAt && closesAt && new Date(opensAt).toDateString() === new Date(closesAt).toDateString();
  if (opensAt && closesAt) {
    return sameDay
      ? `${fmtDayTime(opensAt)} – ${fmtTime(closesAt)}`
      : `${fmtDayTime(opensAt)} – ${fmtDayTime(closesAt)}`;
  }
  return fmtDayTime(opensAt ?? closesAt);
}

function fmtUsd(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

export function RaceDaySheet({
  distances,
  venueName,
  eventFinishNote = true,
}: {
  distances: RaceDaySheetDistance[];
  venueName: string | null;
  /** Show the "all races finish at the venue" footer when any start differs. */
  eventFinishNote?: boolean;
}) {
  const cards = distances.filter((d) => !d.results_published_at);
  if (cards.length === 0) return null;

  const anyCustomStart = cards.some((d) => hasCustomStartLocation(d));

  return (
    <section id="race-day" className="mt-10 scroll-mt-24">
      <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Race Day at a Glance</h2>
      <p className="mt-1 text-sm text-[#1E3A5F]/70">
        Check-in times, start locations, aid stations, and cutoffs for each race. Screenshot this
        for race morning.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {cards.map((d) => {
          const win = effectiveCheckInWindow(d);
          const checkIn = checkInLabel(win.opensAt, win.closesAt);
          const walkUps = walkUpsAllowed(d);
          const walkUpFee = effectiveWalkUpFeeCents(d);
          const customStart = hasCustomStartLocation(d);
          const startName = d.start_location_name?.trim() || null;
          const startAddress = d.start_location_address?.trim() || null;
          const rows: Array<{ icon: string; label: string; value: React.ReactNode }> = [];

          if (d.packet_pickup_info?.trim()) {
            rows.push({ icon: "📦", label: "Packet pickup", value: d.packet_pickup_info.trim() });
          }
          if (checkIn) {
            rows.push({ icon: "✅", label: "Check-in", value: checkIn });
          }
          if (d.gun_time) {
            rows.push({ icon: "🏁", label: "Gun time", value: fmtDayTime(d.gun_time) });
          }
          if (customStart) {
            rows.push({
              icon: "📍",
              label: "Start line",
              value: (
                <>
                  {startName ?? "See map"}
                  {startAddress ? <span className="text-[#1E3A5F]/65"> — {startAddress}</span> : null}
                  {d.start_lat != null && d.start_lng != null ? (
                    <>
                      {" "}
                      <a
                        href={directionsUrl(d.start_lat, d.start_lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[#E87722] underline-offset-2 hover:underline"
                      >
                        Directions →
                      </a>
                    </>
                  ) : null}
                </>
              ),
            });
          } else if (venueName) {
            rows.push({ icon: "📍", label: "Start line", value: venueName });
          }
          if (d.aidStations.length > 0) {
            rows.push({
              icon: "💧",
              label: `Aid stations (${d.aidStations.length})`,
              value: d.aidStations
                .map((s) => {
                  const mile = s.mile_marker ? ` (mi ${s.mile_marker})` : "";
                  const bags = s.drop_bags ? " · drop bags ✓" : "";
                  return `${s.name}${mile}${bags}`;
                })
                .join(" · "),
            });
          }
          if (d.course_cutoff_at) {
            rows.push({ icon: "⏱️", label: "Course cutoff", value: fmtDayTime(d.course_cutoff_at) });
          }

          return (
            <div
              key={d.id}
              className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold text-[#1E3A5F]">
                  {formatDistanceDisplay({ label: d.label, race_name: d.race_name })}
                </h3>
                {walkUps ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-600/15">
                    Race-day registration · {fmtUsd(walkUpFee)}
                  </span>
                ) : (
                  <span className="rounded-full bg-[#1E3A5F]/08 px-2.5 py-0.5 text-xs font-medium text-[#1E3A5F]/70 ring-1 ring-[#1E3A5F]/15">
                    No walk-ups
                  </span>
                )}
              </div>

              {rows.length > 0 ? (
                <dl className="mt-3 space-y-2">
                  {rows.map((r) => (
                    <div key={r.label} className="flex gap-2 text-sm">
                      <dt className="shrink-0 font-medium text-[#1E3A5F]/70">
                        <span aria-hidden className="mr-1">
                          {r.icon}
                        </span>
                        {r.label}:
                      </dt>
                      <dd className="min-w-0 text-[#1E3A5F]">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-3 text-sm text-[#1E3A5F]/55">
                  Details coming soon — check back closer to race day.
                </p>
              )}

              {d.additional_notes?.trim() ? (
                <p className="mt-3 whitespace-pre-wrap border-t border-[#1E3A5F]/10 pt-3 text-sm leading-relaxed text-[#1E3A5F]/75">
                  {d.additional_notes.trim()}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {eventFinishNote && anyCustomStart && venueName ? (
        <p className="mt-4 rounded-lg bg-[#1E3A5F]/05 px-4 py-3 text-sm font-medium text-[#1E3A5F]/80">
          🏆 All races finish at {venueName}.
        </p>
      ) : null}
    </section>
  );
}
