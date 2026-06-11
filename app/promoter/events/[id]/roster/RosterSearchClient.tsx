"use client";

import { useMemo, useState } from "react";

export type RosterRunner = {
  key: string;
  name: string;
  email: string;
  phone: string;
  prId: string | null;
  raceDayBib: string | null;
  paid: boolean;
  distances: { label: string; checkedIn: boolean; entryType: string }[];
};

function matchesQuery(r: RosterRunner, q: string): boolean {
  const hay = [r.name, r.email, r.phone, r.prId ?? "", r.raceDayBib ?? ""].join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

function RunnerTable({ rows, emptyText }: { rows: RosterRunner[]; emptyText: string }) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-[#1E3A5F]/60">{emptyText}</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#1E3A5F]/10 text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
            <th className="px-4 py-2.5">Runner</th>
            <th className="px-4 py-2.5">PR ID</th>
            <th className="px-4 py-2.5">Race-day bib</th>
            <th className="px-4 py-2.5">Races</th>
            <th className="px-4 py-2.5">Paid</th>
            <th className="px-4 py-2.5">Contact</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-[#1E3A5F]/5 last:border-b-0">
              <td className="px-4 py-2.5 font-medium text-[#1E3A5F]">{r.name}</td>
              <td className="px-4 py-2.5 font-mono text-[#1E3A5F]">{r.prId ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-[#1E3A5F]">{r.raceDayBib ?? "—"}</td>
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {r.distances.map((d, i) => (
                    <span
                      key={`${r.key}-${i}`}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                        d.checkedIn
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : "bg-amber-50 text-amber-800 ring-amber-200"
                      }`}
                    >
                      {d.label}
                      {d.entryType === "roll_over" ? " (roll-over)" : ""}
                      {d.checkedIn ? " ✓" : ""}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2.5">{r.paid ? "Paid" : "Unpaid"}</td>
              <td className="px-4 py-2.5 text-[#1E3A5F]/70">
                <span className="block">{r.email || "—"}</span>
                {r.phone ? <span className="block text-xs">{r.phone}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RosterSearchClient({
  notCheckedIn,
  partial,
  checkedIn,
}: {
  notCheckedIn: RosterRunner[];
  partial: RosterRunner[];
  checkedIn: RosterRunner[];
}) {
  const [q, setQ] = useState("");
  const query = q.trim();

  const [fNot, fPartial, fChecked] = useMemo(() => {
    if (!query) return [notCheckedIn, partial, checkedIn];
    return [
      notCheckedIn.filter((r) => matchesQuery(r, query)),
      partial.filter((r) => matchesQuery(r, query)),
      checkedIn.filter((r) => matchesQuery(r, query)),
    ];
  }, [query, notCheckedIn, partial, checkedIn]);

  const totalMatches = fNot.length + fPartial.length + fChecked.length;

  return (
    <>
      <div className="mt-8">
        <label className="block max-w-md">
          <span className="text-sm font-medium text-[#1E3A5F]">Roster search</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email, phone, PR ID, or bib…"
            autoComplete="off"
            className="mt-2 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-4 py-2.5 text-sm text-[#1E3A5F] shadow-sm focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
          />
        </label>
        {query ? (
          <p className="mt-2 text-sm text-[#1E3A5F]/65">
            {totalMatches === 0 ? "No runners match" : `${totalMatches} runner${totalMatches === 1 ? "" : "s"} match`}
            {" — "}
            <button
              type="button"
              onClick={() => setQ("")}
              className="font-medium text-[#E87722] underline-offset-2 hover:underline"
            >
              clear search
            </button>
          </p>
        ) : null}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-[#1E3A5F]">
          Paid, not checked in{" "}
          <span className="font-sans text-base font-semibold text-[#1E3A5F]/55">
            ({query ? `${fNot.length} of ${notCheckedIn.length}` : notCheckedIn.length})
          </span>
        </h2>
        <p className="mt-1 text-sm text-[#1E3A5F]/65">
          Registered runners who haven&apos;t come through the kiosk yet — your race-morning chase list.
        </p>
        <RunnerTable
          rows={fNot}
          emptyText={query ? "No matches in this group." : "Everyone who registered has checked in."}
        />
      </section>

      {partial.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold text-[#1E3A5F]">
            Partially checked in{" "}
            <span className="font-sans text-base font-semibold text-[#1E3A5F]/55">
              ({query ? `${fPartial.length} of ${partial.length}` : partial.length})
            </span>
          </h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/65">Checked in for some of their races but not all.</p>
          <RunnerTable rows={fPartial} emptyText="No matches in this group." />
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold text-[#1E3A5F]">
          Checked in{" "}
          <span className="font-sans text-base font-semibold text-[#1E3A5F]/55">
            ({query ? `${fChecked.length} of ${checkedIn.length}` : checkedIn.length})
          </span>
        </h2>
        <RunnerTable rows={fChecked} emptyText={query ? "No matches in this group." : "No one has checked in yet."} />
      </section>
    </>
  );
}
