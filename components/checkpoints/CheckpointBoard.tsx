"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Live checkpoint progress board. One row per runner, one column per
 * checkpoint; polls for fresh scans. Used by both the promoter page and the
 * public spectator page.
 */

type BoardData = {
  ok: boolean;
  error?: string;
  eventName?: string;
  isPublic?: boolean;
  distances?: Array<{ id: string; label: string }>;
  checkpoints?: Array<{ id: string; distance_id: string; name: string; mile_marker: string | null }>;
  runners?: Array<{
    key: string;
    name: string;
    bib: string | null;
    anonymous: boolean;
    scans: Record<string, string>;
    lastSeenAt: string;
    lastSeenCheckpointId: string;
    distanceIds: string[];
  }>;
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
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  }
  if (!data) {
    return <p className="p-4 text-sm text-[#1E3A5F]/60">Loading live board…</p>;
  }

  const distances = data.distances ?? [];
  const checkpoints = data.checkpoints ?? [];
  const runners = data.runners ?? [];

  if (checkpoints.length === 0) {
    return (
      <p className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 text-sm text-[#1E3A5F]/65">
        No QR checkpoints set up yet — add them on each distance&apos;s edit page.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {updatedAt ? (
        <p className="text-xs text-[#1E3A5F]/50">
          Updates automatically · last refreshed {timeShort(updatedAt.toISOString())}
        </p>
      ) : null}

      {distances
        .filter((d) => checkpoints.some((c) => c.distance_id === d.id))
        .map((d) => {
          const cps = checkpoints.filter((c) => c.distance_id === d.id);
          const rows = runners.filter(
            (r) => r.distanceIds.includes(d.id) || cps.some((c) => r.scans[c.id]),
          );
          return (
            <section key={d.id}>
              <h3 className="font-display text-lg font-semibold text-[#1E3A5F]">{d.label}</h3>
              {rows.length === 0 ? (
                <p className="mt-2 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 text-sm text-[#1E3A5F]/55">
                  No scans yet for this race.
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
                          <td className="px-4 py-2.5 font-medium text-[#1E3A5F]">
                            {r.name}
                            {r.anonymous ? (
                              <span className="ml-2 text-xs text-[#1E3A5F]/45">(no bib)</span>
                            ) : null}
                          </td>
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
  );
}
