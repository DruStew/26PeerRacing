"use client";

import { useMemo, useState } from "react";

export type RosterRunner = {
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
};

type Selection = {
  selected: Set<string>;
  toggle: (key: string) => void;
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

const checkboxClass =
  "h-5 w-5 shrink-0 cursor-pointer rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]";

function RunnerCards({
  rows,
  emptyText,
  onManage,
  selection,
}: {
  rows: RosterRunner[];
  emptyText: string;
  onManage: (runner: RosterRunner) => void;
  selection?: Selection;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-[#1E3A5F]/60">{emptyText}</p>;
  }
  return (
    <ul className="mt-3 space-y-2 md:hidden">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-stretch gap-2">
            {selection ? (
              <label
                className="flex cursor-pointer items-center rounded-xl border border-[#1E3A5F]/10 bg-white px-3 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={selection.selected.has(r.key)}
                  onChange={() => selection.toggle(r.key)}
                  aria-label={`Select ${r.name}`}
                  className={checkboxClass}
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => onManage(r)}
              className="flex w-full min-w-0 flex-col gap-2 rounded-xl border border-[#1E3A5F]/10 bg-white px-4 py-3.5 text-left shadow-sm transition-colors active:bg-[#fafbfc] hover:border-[#E87722]/35"
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
          </div>
        </li>
      ))}
    </ul>
  );
}

function RunnerTable({
  rows,
  emptyText,
  onManage,
  selection,
}: {
  rows: RosterRunner[];
  emptyText: string;
  onManage: (runner: RosterRunner) => void;
  selection?: Selection;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 hidden text-sm text-[#1E3A5F]/60 md:block">{emptyText}</p>;
  }
  return (
    <div className="mt-3 hidden overflow-x-auto rounded-xl border border-[#1E3A5F]/10 bg-white md:block">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#1E3A5F]/10 text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
            {selection ? <th className="w-10 px-4 py-2.5" aria-label="Select" /> : null}
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
              {selection ? (
                <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selection.selected.has(r.key)}
                    onChange={() => selection.toggle(r.key)}
                    aria-label={`Select ${r.name}`}
                    className={checkboxClass}
                  />
                </td>
              ) : null}
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
  selection,
}: {
  rows: RosterRunner[];
  emptyText: string;
  onManage: (runner: RosterRunner) => void;
  selection?: Selection;
}) {
  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-[#1E3A5F]/60">{emptyText}</p>;
  }
  return (
    <>
      <RunnerCards rows={rows} emptyText={emptyText} onManage={onManage} selection={selection} />
      <RunnerTable rows={rows} emptyText={emptyText} onManage={onManage} selection={selection} />
    </>
  );
}

/** "Select all" toggle for the visible (filtered) rows of one section. */
function SelectAllRow({
  rows,
  selected,
  onSelectKeys,
  onDeselectKeys,
}: {
  rows: RosterRunner[];
  selected: Set<string>;
  onSelectKeys: (keys: string[]) => void;
  onDeselectKeys: (keys: string[]) => void;
}) {
  if (rows.length === 0) return null;
  const keys = rows.map((r) => r.key);
  const allSelected = keys.every((k) => selected.has(k));
  const someSelected = !allSelected && keys.some((k) => selected.has(k));
  return (
    <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#1E3A5F]">
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => {
          if (el) el.indeterminate = someSelected;
        }}
        onChange={() => (allSelected ? onDeselectKeys(keys) : onSelectKeys(keys))}
        className={checkboxClass}
      />
      Select all{rows.length > 1 ? ` (${rows.length})` : ""}
    </label>
  );
}

export function RosterSearchClient({
  eventId,
  notCheckedIn,
  partial,
  checkedIn,
  onManage,
  onBulkDone,
}: {
  eventId: string;
  notCheckedIn: RosterRunner[];
  partial: RosterRunner[];
  checkedIn: RosterRunner[];
  onManage: (runner: RosterRunner) => void;
  /** Called after a successful bulk check-in so the parent can refresh data. */
  onBulkDone: () => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectKeys = (keys: string[]) =>
    setSelected((prev) => new Set([...prev, ...keys]));
  const deselectKeys = (keys: string[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) next.delete(k);
      return next;
    });

  const [fNot, fPartial, fChecked] = useMemo(() => {
    if (!query) return [notCheckedIn, partial, checkedIn];
    return [
      notCheckedIn.filter((r) => matchesQuery(r, query)),
      partial.filter((r) => matchesQuery(r, query)),
      checkedIn.filter((r) => matchesQuery(r, query)),
    ];
  }, [query, notCheckedIn, partial, checkedIn]);

  const totalMatches = fNot.length + fPartial.length + fChecked.length;

  // Only runners with something left to check in are selectable.
  const selectableRunners = useMemo(() => [...notCheckedIn, ...partial], [notCheckedIn, partial]);
  const selectedRunners = selectableRunners.filter((r) => selected.has(r.key));

  const selection: Selection = { selected, toggle };

  const bulkCheckIn = async () => {
    if (selectedRunners.length === 0 || busy) return;
    setBusy(true);
    setBulkError(null);
    setBulkNotice(null);
    try {
      const entryIds = selectedRunners.flatMap((r) => r.entryIds);
      const res = await fetch("/api/kiosk/check-in/bulk-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, entryIds }),
      });
      const json = (await res.json()) as { ok: boolean; updated?: number; error?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Bulk check-in failed");
      }
      setBulkNotice(
        `Checked in ${selectedRunners.length} runner${selectedRunners.length === 1 ? "" : "s"}.`,
      );
      setSelected(new Set());
      onBulkDone();
    } catch (e) {
      setBulkError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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

      {selectedRunners.length > 0 || bulkNotice || bulkError ? (
        <div className="sticky top-2 z-20 mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-[#E87722]/30 bg-white/95 px-4 py-3 shadow-md backdrop-blur">
          {selectedRunners.length > 0 ? (
            <>
              <span className="text-sm font-semibold text-[#1E3A5F]">
                {selectedRunners.length} runner{selectedRunners.length === 1 ? "" : "s"} selected
              </span>
              <button
                type="button"
                onClick={bulkCheckIn}
                disabled={busy}
                className="rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "Checking in…" : `Check in selected (${selectedRunners.length})`}
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                disabled={busy}
                className="text-sm font-medium text-[#1E3A5F]/70 underline-offset-2 hover:text-[#1E3A5F] hover:underline disabled:opacity-60"
              >
                Clear selection
              </button>
            </>
          ) : null}
          {bulkNotice ? (
            <span className="text-sm font-medium text-emerald-700">{bulkNotice}</span>
          ) : null}
          {bulkError ? <span className="text-sm font-medium text-red-600">{bulkError}</span> : null}
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">
          Paid, Not Checked In{" "}
          <span className="font-sans text-base font-semibold text-[#1E3A5F]/55">
            ({query ? `${fNot.length} of ${notCheckedIn.length}` : notCheckedIn.length})
          </span>
        </h2>
        <p className="mt-1 text-sm text-[#1E3A5F]/65">
          Registered runners who haven&apos;t come through the kiosk yet — tap a runner to check them in, or use
          the checkboxes to check in many at once.
        </p>
        <SelectAllRow
          rows={fNot}
          selected={selected}
          onSelectKeys={selectKeys}
          onDeselectKeys={deselectKeys}
        />
        <RunnerList
          rows={fNot}
          emptyText={query ? "No matches in this group." : "Everyone who registered has checked in."}
          onManage={onManage}
          selection={selection}
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
          <p className="mt-1 text-sm text-[#1E3A5F]/65">
            Checked in for some of their races but not all. Selecting a runner here checks in their remaining
            races.
          </p>
          <SelectAllRow
            rows={fPartial}
            selected={selected}
            onSelectKeys={selectKeys}
            onDeselectKeys={deselectKeys}
          />
          <RunnerList rows={fPartial} emptyText="No matches in this group." onManage={onManage} selection={selection} />
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
