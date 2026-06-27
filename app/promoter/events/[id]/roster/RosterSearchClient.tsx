"use client";

import { useMemo, useState } from "react";

export type RosterRunner = {
  key: string;
  userId: string | null;
  entryId: string;
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

function DistanceBadges({ distances, runnerKey }: { distances: RosterRunner["distances"]; runnerKey: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {distances.map((d, i) => (
        <span
          key={`${runnerKey}-${i}`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
            d.checkedIn
              ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
              : "bg-amber-50 text-amber-800 ring-amber-200"
          }`}
        >
          {d.label}
          {d.entryType === "roll_over" ? " (Carry-Over)" : ""}
          {d.checkedIn ? " ✓" : ""}
        </span>
      ))}
    </div>
  );
}

function RunnerCards({
  rows,
  emptyText,
  onManage,
}: {
  rows: RosterRunner[];
  emptyText: string;
  onManage: (runner: RosterRunner) => void;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-[#1E3A5F]/60">{emptyText}</p>;
  }
  return (
    <ul className="mt-3 space-y-2 md:hidden">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={() => onManage(r)}
            className="flex w-full flex-col gap-2 rounded-xl border border-[#1E3A5F]/10 bg-white px-4 py-3.5 text-left shadow-sm transition-colors active:bg-[#fafbfc] hover:border-[#E87722]/35"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#1E3A5F]">{r.name}</p>
                <p className="mt-0.5 text-xs text-[#1E3A5F]/60">
                  PR ID{" "}
                  <span className="font-mono font-semibold text-[#1E3A5F]">{r.prId ?? "—"}</span>
                  {r.raceDayBib ? (
                    <>
                      {" "}
                      · Bib <span className="font-mono font-semibold text-[#1E3A5F]">{r.raceDayBib}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-[#E87722] px-2.5 py-1 text-[11px] font-semibold text-white">
                Open
              </span>
            </div>
            <DistanceBadges distances={r.distances} runnerKey={r.key} />
            <p className="text-xs text-[#1E3A5F]/55">
              {r.paid ? "Paid" : "Unpaid"}
              {r.email ? ` · ${r.email}` : ""}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RunnerTable({
  rows,
  emptyText,
  onManage,
}: {
  rows: RosterRunner[];
  emptyText: string;
  onManage: (runner: RosterRunner) => void;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 hidden text-sm text-[#1E3A5F]/60 md:block">{emptyText}</p>;
  }
  return (
    <div className="mt-3 hidden overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white md:block">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#1E3A5F]/10 text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
            <th className="px-4 py-2.5">Runner</th>
            <th className="px-4 py-2.5">PR ID</th>
            <th className="px-4 py-2.5">Race-day bib</th>
            <th className="px-4 py-2.5">Races</th>
            <th className="px-4 py-2.5">Paid</th>
            <th className="px-4 py-2.5">Contact</th>
            <th className="px-4 py-2.5">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              role="button"
              tabIndex={0}
              onClick={() => onManage(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onManage(r);
                }
              }}
              className="cursor-pointer border-b border-[#1E3A5F]/5 transition-colors last:border-b-0 hover:bg-[#fafbfc]"
            >
              <td className="px-4 py-2.5 font-medium text-[#1E3A5F]">{r.name}</td>
              <td className="px-4 py-2.5 font-mono text-[#1E3A5F]">{r.prId ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-[#1E3A5F]">{r.raceDayBib ?? "—"}</td>
              <td className="px-4 py-2.5">
                <DistanceBadges distances={r.distances} runnerKey={r.key} />
              </td>
              <td className="px-4 py-2.5">{r.paid ? "Paid" : "Unpaid"}</td>
              <td className="px-4 py-2.5 text-[#1E3A5F]/70">
                <span className="block">{r.email || "—"}</span>
                {r.phone ? <span className="block text-xs">{r.phone}</span> : null}
              </td>
              <td className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManage(r);
                  }}
                  className="rounded-md bg-[#E87722] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E87722]/90"
                >
                  Manage
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunnerList({
  rows,
  emptyText,
  onManage,
}: {
  rows: RosterRunner[];
  emptyText: string;
  onManage: (runner: RosterRunner) => void;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-[#1E3A5F]/60">{emptyText}</p>;
  }
  return (
    <>
      <RunnerCards rows={rows} emptyText={emptyText} onManage={onManage} />
      <RunnerTable rows={rows} emptyText={emptyText} onManage={onManage} />
    </>
  );
}

export function RosterSearchClient({
  notCheckedIn,
  partial,
  checkedIn,
  onManage,
}: {
  notCheckedIn: RosterRunner[];
  partial: RosterRunner[];
  checkedIn: RosterRunner[];
  onManage: (runner: RosterRunner) => void;
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
          <span className="text-sm font-medium text-[#1E3A5F]">Roster Search</span>
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
        <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">
          Paid, Not Checked In{" "}
          <span className="font-sans text-base font-semibold text-[#1E3A5F]/55">
            ({query ? `${fNot.length} of ${notCheckedIn.length}` : notCheckedIn.length})
          </span>
        </h2>
        <p className="mt-1 text-sm text-[#1E3A5F]/65">
          Registered runners who haven&apos;t come through the kiosk yet — tap a runner to check them in.
        </p>
        <RunnerList
          rows={fNot}
          emptyText={query ? "No matches in this group." : "Everyone who registered has checked in."}
          onManage={onManage}
        />
      </section>

      {partial.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">
            Partially Checked In{" "}
            <span className="font-sans text-base font-semibold text-[#1E3A5F]/55">
              ({query ? `${fPartial.length} of ${partial.length}` : partial.length})
            </span>
          </h2>
          <p className="mt-1 text-sm text-[#1E3A5F]/65">Checked in for some of their races but not all.</p>
          <RunnerList rows={fPartial} emptyText="No matches in this group." onManage={onManage} />
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">
          Checked In{" "}
          <span className="font-sans text-base font-semibold text-[#1E3A5F]/55">
            ({query ? `${fChecked.length} of ${checkedIn.length}` : checkedIn.length})
          </span>
        </h2>
        <RunnerList
          rows={fChecked}
          emptyText={query ? "No matches in this group." : "No one has checked in yet."}
          onManage={onManage}
        />
      </section>
    </>
  );
}
