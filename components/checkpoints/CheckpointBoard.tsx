"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Live checkpoint progress board. Entered racers (roster-matched scans) get
 * the full checkpoint grid; trail-side guests (unmatched bibs / anonymous
 * scans) appear in a separate promoter-only list. Polls for fresh scans.
 */

type RacerRow = {
  key: string;
  name: string;
  bib: string | null;
  scans: Record<string, string>;
  lastSeenAt: string;
  lastSeenCheckpointId: string;
  distanceIds: string[];
};

type GuestRow = {
  key: string;
  name: string;
  bib: string | null;
  anonymous: boolean;
  scans: Record<string, string>;
  lastSeenAt: string;
  lastSeenCheckpointId: string;
};

type BoardData = {
  ok: boolean;
  error?: string;
  eventName?: string;
  isPublic?: boolean;
  distances?: Array<{ id: string; label: string }>;
  checkpoints?: Array<{ id: string; distance_id: string; name: string; mile_marker: string | null }>;
  racers?: RacerRow[];
  guests?: GuestRow[] | null;
};

const POLL_MS = 30_000;

function timeShort(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function CheckpointBoard({ eventId }: { eventId: string }) {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/checkpoint-board`, { cache: "no-store" });
      const json = (await res.json()) as BoardData;
      if (!json.ok) {
        setError(json.error ?? "Could not load the board.");
        return;
      }
      setError(null);
      setData(json);
      setUpdatedAt(new Date());
    } catch {
      setError("Could not reach the server.");
    }
  }, [eventId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), POLL_MS);
    return () => {
      window.clearTimeout(initial);
      clearInterval(t);
    };
  }, [load]);

  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  }
  if (!data) {
    return <p className="p-4 text-sm text-[#1E3A5F]/60">Loading live board…</p>;
  }

  const distances = data.distances ?? [];
  const checkpoints = data.checkpoints ?? [];
  const racers = data.racers ?? [];
  const guests = data.guests ?? null;
  const checkpointById = new Map(checkpoints.map((c) => [c.id, c]));

  if (checkpoints.length === 0) {
    return (
      <p className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 text-sm text-[#1E3A5F]/65">
        No QR checkpoints set up yet — add them on each distance&apos;s edit page.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {updatedAt ? (
        <p className="text-xs text-[#1E3A5F]/50">
          Updates automatically · last refreshed {timeShort(updatedAt.toISOString())}
        </p>
      ) : null}

      {/* Entered racers — the board proper */}
      <div className="space-y-8">
        <h2 className="font-display text-xl font-bold text-[#1E3A5F]">Entered Racers</h2>
        {distances
          .filter((d) => checkpoints.some((c) => c.distance_id === d.id))
          .map((d) => {
            const cps = checkpoints.filter((c) => c.distance_id === d.id);
            const rows = racers.filter(
              (r) => r.distanceIds.includes(d.id) || cps.some((c) => r.scans[c.id]),
            );
            return (
              <section key={d.id}>
                <h3 className="font-display mb-3 border-b border-[#1E3A5F]/10 pb-2 text-lg font-semibold text-[#1E3A5F]">
                  {d.label}
                </h3>
                {rows.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 text-sm text-[#1E3A5F]/55">
                    No racer scans yet for this race.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#1E3A5F]/10 text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                          <th className="px-4 py-2.5">Runner</th>
                          <th className="px-4 py-2.5">Bib</th>
                          {cps.map((c, i) => (
                            <th key={c.id} className="px-4 py-2.5 whitespace-nowrap">
                              {i + 1}. {c.name}
                              {c.mile_marker ? (
                                <span className="block text-[10px] font-normal normal-case text-[#1E3A5F]/45">
                                  Mile {c.mile_marker}
                                </span>
                              ) : null}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.key} className="border-b border-[#1E3A5F]/5 last:border-0">
                            <td className="px-4 py-2.5 font-medium text-[#1E3A5F]">{r.name}</td>
                            <td className="px-4 py-2.5 font-mono text-[#1E3A5F]/75">{r.bib ?? "—"}</td>
                            {cps.map((c) => {
                              const at = r.scans[c.id];
                              const isLast = at && r.lastSeenCheckpointId === c.id;
                              return (
                                <td key={c.id} className="px-4 py-2.5 whitespace-nowrap">
                                  {at ? (
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                                        isLast
                                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                                          : "bg-[#1E3A5F]/5 text-[#1E3A5F]/75 ring-[#1E3A5F]/10"
                                      }`}
                                    >
                                      {timeShort(at)}
                                    </span>
                                  ) : (
                                    <span className="text-[#1E3A5F]/25">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
      </div>

      {/* Guests — promoter-only (API omits this for the public view) */}
      {guests !== null ? (
        <section>
          <h2 className="font-display text-xl font-bold text-[#1E3A5F]">Guests</h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/65">
            Scans that didn&apos;t match your roster — passers-by, spectators, or racers who
            mistyped their bib. Not shown on the public board.
          </p>
          {guests.length === 0 ? (
            <p className="mt-3 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 text-sm text-[#1E3A5F]/55">
              No guest scans yet.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#1E3A5F]/10 text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                    <th className="px-4 py-2.5">Guest</th>
                    <th className="px-4 py-2.5">Checkpoints scanned</th>
                    <th className="px-4 py-2.5">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {guests.map((g) => {
                    const lastCp = checkpointById.get(g.lastSeenCheckpointId);
                    return (
                      <tr key={g.key} className="border-b border-[#1E3A5F]/5 last:border-0">
                        <td className="px-4 py-2.5 font-medium text-[#1E3A5F]">
                          {g.name}
                          {!g.anonymous ? (
                            <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                              check bib
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-[#1E3A5F]/75">{Object.keys(g.scans).length}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-[#1E3A5F]/75">
                          {lastCp ? `${lastCp.name} · ` : ""}
                          {timeShort(g.lastSeenAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
