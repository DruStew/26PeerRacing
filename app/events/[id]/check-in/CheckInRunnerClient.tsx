"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CheckInStripeSync } from "./CheckInStripeSync";

/** One row per runner from kiosk search; `id` is any entry id for this user+event (for API fallback). */
type SearchRow = {
  id: string;
  user_id?: string | null;
  /** Peer Racing ID / canonical bib # (profiles.pr_id). */
  pr_id?: string | null;
  first_name: string;
  last_name: string;
  bib: string | null;
  phone: string | null;
  email: string | null;
  /** Distances this runner is entered in for this event (detail loads after tap). */
  entry_count: number;
  /** Short list of distance names for this event (from search RPC). */
  distance_summary?: string | null;
};

type RunnerEntry = {
  id: string;
  distance_id: string;
  entry_type: string;
  source_entry_id: string | null;
  entry_kind: string;
  paid_at: string | null;
  paid_amount_cents: number | null;
  transponder_1: string | null;
  transponder_2: string | null;
  bib: string | null;
  /** Host timing bib for this distance only (kiosk check-in). */
  assigned_bib?: string | null;
  distance_label: string;
  kiosk_checked_in_at?: string | null;
};

type RunnerProfile = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  /** Peer Racing ID / bib #; entries.bib mirrors per race for RR export. */
  pr_id: string | null;
};

type UpsellDist = { id: string; label: string; entry_fee_cents: number };
type RollOpt = {
  targetDistanceId: string;
  sourceDistanceId: string;
  label: string;
  entry_fee_cents: number;
};

function searchResultKey(row: SearchRow) {
  return (
    row.user_id ??
    (row.email?.trim() ? `em:${row.email.toLowerCase().trim()}` : `entry:${row.id}`)
  );
}

function safeEntryCount(n: unknown): number {
  const v = typeof n === "string" ? parseInt(n, 10) : Number(n);
  return Number.isFinite(v) && v >= 0 ? v : 0;
}

function isCarryOverEntry(e: RunnerEntry) {
  return e.entry_type === "roll_over";
}

/** Qualifier / primary row that owns the RFID pair for a carry-over split. */
function primaryEntryForCarryOver(entries: RunnerEntry[], carry: RunnerEntry): RunnerEntry | undefined {
  if (!isCarryOverEntry(carry) || !carry.source_entry_id) return undefined;
  return entries.find((x) => x.id === carry.source_entry_id);
}

export function CheckInRunnerClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [pending, setPending] = useState(false);
  const [searchRows, setSearchRows] = useState<SearchRow[] | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  /** Which search group row is selected (stable while user_id may be missing from API). */
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [runner, setRunner] = useState<{
    profile: RunnerProfile;
    entries: RunnerEntry[];
    upsellDistances: UpsellDist[];
    rollOverOptions: RollOpt[];
  } | null>(null);
  const [loadRunnerPending, setLoadRunnerPending] = useState(false);

  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [assignedRaceBib, setAssignedRaceBib] = useState("");
  /** Which number is on the runner's chest: lifetime PR ID or an event-specific race-day bib. */
  const [bibMode, setBibMode] = useState<"pr" | "raceday">("raceday");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  /** Conflict/save error shown in red inside the timing panel (e.g. duplicate bib). */
  const [saveError, setSaveError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);
  const [withdrawPendingId, setWithdrawPendingId] = useState<string | null>(null);
  const [checkInPendingId, setCheckInPendingId] = useState<string | null>(null);
  /** Bib from search row if profile/entries haven’t loaded pr_id yet (same DB, kiosk display). */
  const [kioskBibFallback, setKioskBibFallback] = useState<string | null>(null);

  /** Full-screen runner panel after picking a search result; Done clears search for the next athlete. */
  const [runnerModalOpen, setRunnerModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /** Merge duplicate search rows if the API returned more than one group for the same person (legacy DB). */
  const displaySearchRows = useMemo(() => {
    if (!searchRows?.length) return [];
    const byKey = new Map<string, SearchRow>();
    for (const row of searchRows) {
      const key = searchResultKey(row);
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, row);
        continue;
      }
      const summaries = [prev.distance_summary, row.distance_summary].filter(Boolean);
      const mergedSummary = summaries.length
        ? [...new Set(summaries.join(" · ").split(" · ").map((s) => s.trim()).filter(Boolean))].join(" · ")
        : prev.distance_summary ?? row.distance_summary;
      byKey.set(key, {
        ...prev,
        entry_count: Math.max(safeEntryCount(prev.entry_count), safeEntryCount(row.entry_count)),
        distance_summary: mergedSummary ?? prev.distance_summary,
      });
    }
    return [...byKey.values()];
  }, [searchRows]);

  /** Monotonic counter so stale (out-of-order) live-search responses never overwrite newer ones. */
  const searchSeqRef = useRef(0);

  const search = useCallback(async () => {
    const seq = ++searchSeqRef.current;
    setError(null);
    setPending(true);
    setRunner(null);
    setSelectedUserId(null);
    setSelectedGroupKey(null);
    setKioskBibFallback(null);
    setRunnerModalOpen(false);
    try {
      const res = await fetch("/api/kiosk/check-in/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, q }),
      });
      const json = (await res.json()) as { ok?: boolean; results?: SearchRow[]; error?: string };
      if (seq !== searchSeqRef.current) return;
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Search failed");
        return;
      }
      setSearchRows(json.results ?? []);
    } catch {
      if (seq === searchSeqRef.current) setError("Network error");
    } finally {
      if (seq === searchSeqRef.current) setPending(false);
    }
  }, [eventId, q]);

  /** Live search-as-you-type: results update ~250ms after the kiosk operator stops typing. */
  useEffect(() => {
    if (runnerModalOpen) return;
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      searchSeqRef.current++;
      setSearchRows(null);
      setPending(false);
      return;
    }
    const timer = setTimeout(() => void search(), 250);
    return () => clearTimeout(timer);
  }, [q, search, runnerModalOpen]);

  const loadRunner = useCallback(
    async (opts: {
      userId?: string | null;
      entryId?: string | null;
      /** If refresh fails, keep current runner and do not show a global error (e.g. after check-in merge). */
      quietRefresh?: boolean;
    }) => {
      if (!opts.quietRefresh) {
        setError(null);
      }
      setLoadRunnerPending(true);
      setActiveEntryId(null);
      try {
        const res = await fetch("/api/kiosk/check-in/runner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            userId: opts.userId?.trim() ?? "",
            entryId: opts.entryId?.trim() ?? "",
          }),
        });
        const json = (await res.json()) as {
          ok?: boolean;
          profile?: RunnerProfile;
          entries?: RunnerEntry[];
          upsellDistances?: UpsellDist[];
          rollOverOptions?: RollOpt[];
          error?: string;
        };
        if (!res.ok || !json.ok || !json.profile) {
          if (!opts.quietRefresh) {
            setError(json.error ?? "Could not load runner");
            setRunner(null);
          }
          return;
        }
        setSelectedUserId(json.profile.id);
        setRunner({
          profile: json.profile,
          entries: json.entries ?? [],
          upsellDistances: json.upsellDistances ?? [],
          rollOverOptions: json.rollOverOptions ?? [],
        });
      } catch {
        if (!opts.quietRefresh) {
          setError("Network error");
          setRunner(null);
        }
      } finally {
        setLoadRunnerPending(false);
      }
    },
    [eventId],
  );

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id");
    const kioskUser = searchParams.get("kiosk_user");
    const uid = kioskUser ?? selectedUserId;
    if (checkout === "success" && sessionId && uid) {
      setRunnerModalOpen(true);
      void loadRunner({ userId: uid });
      router.replace(`/events/${eventId}/check-in`, { scroll: false });
    }
  }, [searchParams, eventId, selectedUserId, loadRunner, router]);

  function pickSearchRow(row: SearchRow) {
    setRunnerModalOpen(true);
    setSelectedGroupKey(searchResultKey(row));
    setKioskBibFallback(row.pr_id?.trim() || row.bib?.trim() || null);
    void loadRunner({ userId: row.user_id ?? undefined, entryId: row.id });
  }

  const closeRunnerModal = useCallback(() => {
    setRunnerModalOpen(false);
    setRunner(null);
    setSelectedUserId(null);
    setSelectedGroupKey(null);
    setActiveEntryId(null);
    setKioskBibFallback(null);
    setSearchRows(null);
    setQ("");
    setError(null);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  function selectEntryForTransponders(e: RunnerEntry) {
    setActiveEntryId(e.id);
    setError(null);
  }

  useEffect(() => {
    if (!activeEntryId || !runner) return;
    const e = runner.entries.find((x) => x.id === activeEntryId);
    if (!e || isCarryOverEntry(e)) return;
    setT1(e.transponder_1 ?? "");
    setT2(e.transponder_2 ?? "");
    const bib = e.assigned_bib?.trim() ?? "";
    setAssignedRaceBib(bib);
    const prId = runner.profile.pr_id?.trim() ?? "";
    setBibMode(prId && bib === prId ? "pr" : "raceday");
    setSaveError(null);
  }, [activeEntryId, runner]);

  async function saveTransponders() {
    if (!activeEntryId) return;
    setSavePending(true);
    setError(null);
    setSaveError(null);
    try {
      const res = await fetch("/api/kiosk/check-in/entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          entryId: activeEntryId,
          transponder1: t1.trim() || null,
          transponder2: t2.trim() || null,
          assignedBib: assignedRaceBib.trim() || null,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        entry?: {
          transponder_1: string | null;
          transponder_2: string | null;
          assigned_bib?: string | null;
        };
      };
      if (!res.ok || !json.ok) {
        setSaveError(json.error ?? "Could not save");
        return;
      }
      if (selectedUserId) await loadRunner({ userId: selectedUserId });
    } catch {
      setSaveError("Network error");
    } finally {
      setSavePending(false);
    }
  }

  async function confirmCheckInForEntry(entryId: string) {
    setCheckInPendingId(entryId);
    setError(null);
    try {
      const res = await fetch("/api/kiosk/check-in/entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, entryId, confirmCheckIn: true }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        entry?: {
          id: string;
          kiosk_checked_in_at?: string | null;
          transponder_1?: string | null;
          transponder_2?: string | null;
          assigned_bib?: string | null;
        };
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not confirm check-in");
        return;
      }
      if (json.entry) {
        const patch = json.entry;
        setRunner((prev) => {
          if (!prev) return prev;
          const nextEntries = prev.entries.map((en) =>
            en.id === patch.id
              ? {
                  ...en,
                  kiosk_checked_in_at: patch.kiosk_checked_in_at ?? en.kiosk_checked_in_at,
                  transponder_1:
                    patch.transponder_1 !== undefined ? patch.transponder_1 : en.transponder_1,
                  transponder_2:
                    patch.transponder_2 !== undefined ? patch.transponder_2 : en.transponder_2,
                  assigned_bib:
                    patch.assigned_bib !== undefined ? patch.assigned_bib : en.assigned_bib,
                }
              : en,
          );
          return {
            ...prev,
            entries: nextEntries,
          };
        });
      }
      if (selectedUserId) await loadRunner({ userId: selectedUserId, quietRefresh: true });
    } catch {
      setError("Network error");
    } finally {
      setCheckInPendingId(null);
    }
  }

  async function withdrawEntry(entryId: string) {
    if (!window.confirm("Withdraw this runner from this race? Paid fees go to their wallet as credit.")) {
      return;
    }
    setWithdrawPendingId(entryId);
    setError(null);
    try {
      const res = await fetch("/api/kiosk/check-in/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, entryId }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Withdraw failed");
        return;
      }
      setActiveEntryId(null);
      if (selectedUserId) await loadRunner({ userId: selectedUserId });
    } catch {
      setError("Network error");
    } finally {
      setWithdrawPendingId(null);
    }
  }

  async function addEntry(opts: {
    distanceId: string;
    mode: "primary" | "roll_over";
    sourceDistanceId?: string;
  }) {
    setAddPending(true);
    setError(null);
    try {
      const res = await fetch("/api/kiosk/check-in/add-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          userId: selectedUserId,
          mode: opts.mode,
          distanceId: opts.distanceId,
          sourceDistanceId: opts.sourceDistanceId,
          useWallet: true,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        kind?: string;
        url?: string;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Could not add entry");
        return;
      }
      if (json.kind === "stripe" && json.url) {
        window.location.href = json.url;
        return;
      }
      if (selectedUserId) await loadRunner({ userId: selectedUserId });
    } catch {
      setError("Network error");
    } finally {
      setAddPending(false);
    }
  }

  const displayBib =
    runner?.profile.pr_id?.trim() ||
    runner?.entries.find((e) => e.bib?.trim())?.bib?.trim() ||
    runner?.entries[0]?.bib?.trim() ||
    kioskBibFallback ||
    "—";

  const hasCarryOverSplit = Boolean(runner?.entries.some((e) => isCarryOverEntry(e)));
  const activeEntry = runner?.entries.find((e) => e.id === activeEntryId) ?? null;

  /** PR ID is the runner's identity and never leaves the hero card. */
  const heroPrId = runner?.profile.pr_id?.trim() || null;
  /** Race-day bib(s) assigned for this event (normally one number shared across the weekend). */
  const heroRaceDayBibs = [
    ...new Set(
      (runner?.entries ?? [])
        .map((e) => e.assigned_bib?.trim())
        .filter((b): b is string => Boolean(b && b !== heroPrId)),
    ),
  ];
  /** Fallback identity number when the profile has no PR ID (legacy/on-file bib). */
  const heroFallbackBib = heroPrId ? null : displayBib;

  useEffect(() => {
    if (activeEntry && isCarryOverEntry(activeEntry)) {
      setActiveEntryId(null);
    }
  }, [activeEntry]);

  useEffect(() => {
    if (!runnerModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeRunnerModal();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runnerModalOpen, closeRunnerModal]);

  return (
    <div className="relative mt-10 space-y-8 text-left">
      <CheckInStripeSync eventId={eventId} />

      <div>
        <label className="block text-sm font-medium text-[#1E3A5F]">Find Runner (This Event)</label>
        <p className="mt-1 text-xs text-[#1E3A5F]/60">
          PR ID, assigned race bib, name, email, or phone — at least 2 characters.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            ref={searchInputRef}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
            className="min-w-0 flex-1 rounded-lg border border-[#1E3A5F]/20 px-4 py-2.5 text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
            placeholder="e.g. 0001, host bib 237, or Jane Doe"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => void search()}
            className="rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-60"
          >
            {pending ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {error && !runnerModalOpen ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {searchRows && searchRows.length === 0 ? (
        <p className="text-sm text-[#1E3A5F]/70">No matching entries for this event.</p>
      ) : null}

      {searchRows && searchRows.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1E3A5F]/55">Search Results</p>
          <ul className="mt-2 divide-y divide-[#1E3A5F]/10 rounded-xl border border-[#1E3A5F]/10 bg-white">
            {displaySearchRows.map((row) => {
              const groupKey = searchResultKey(row);
              const bibShow = row.pr_id ?? row.bib ?? "—";
              const ec = safeEntryCount(row.entry_count);
              const raceLabel = ec === 1 ? "1 race entered" : `${ec} races entered`;
              return (
                <li key={groupKey}>
                  <button
                    type="button"
                    onClick={() => pickSearchRow(row)}
                    className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-sm transition-colors hover:bg-[#fafbfc] ${
                      selectedGroupKey === groupKey ? "bg-[#fafbfc] ring-1 ring-inset ring-[#E87722]/40" : ""
                    }`}
                  >
                    <span className="font-semibold text-[#1E3A5F]">
                      {row.first_name} {row.last_name}
                    </span>
                    <span className="text-xs text-[#1E3A5F]/55">
                      Bib # <span className="font-mono font-semibold text-[#1E3A5F]">{bibShow}</span>
                      <span className="text-[#1E3A5F]/45"> · {raceLabel}</span>
                    </span>
                    {row.distance_summary ? (
                      <span className="text-xs leading-snug text-[#1E3A5F]/70">{row.distance_summary}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {runnerModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-center bg-[#1E3A5F]/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kiosk-runner-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeRunnerModal();
          }}
        >
          <div className="flex h-[100dvh] w-full max-w-2xl flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:rounded-2xl sm:border sm:border-[#1E3A5F]/10">
            <div className="shrink-0 border-b border-[#1E3A5F]/10 px-4 py-3 sm:rounded-t-2xl">
              <p id="kiosk-runner-modal-title" className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1E3A5F]/55">
                Runner check-in
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-[#1E3A5F]">
                {runner
                  ? `${runner.profile.first_name} ${runner.profile.last_name}`
                  : loadRunnerPending
                    ? "Loading…"
                    : "Lookup"}
              </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {error && runnerModalOpen ? (
                <p className="mb-4 text-sm text-red-700" role="alert">
                  {error}
                </p>
              ) : null}

              {loadRunnerPending && !runner && !error ? (
                <p className="text-sm text-[#1E3A5F]/70">Loading runner…</p>
              ) : null}

              {runner ? (
        <div className="space-y-8">
          <div className="rounded-2xl border-2 border-[#1E3A5F]/15 bg-white p-6 text-center shadow-sm">
            <p className="text-xl font-bold text-[#1E3A5F] sm:text-2xl">
              {runner.profile.first_name} {runner.profile.last_name}
            </p>
            <p className="mt-1 text-sm text-[#1E3A5F]/65">{runner.profile.email}</p>
            <div className="mt-4 flex flex-wrap items-stretch justify-center gap-3">
              <div className="min-w-[10rem] rounded-xl bg-[#1E3A5F] px-5 py-3 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
                  Peer Racing ID · lifetime
                </p>
                <p className="font-display mt-1 text-4xl font-bold tabular-nums text-[#E87722]">
                  {heroPrId ?? heroFallbackBib ?? "—"}
                </p>
              </div>
              {heroRaceDayBibs.length > 0 ? (
                <div className="min-w-[10rem] rounded-xl border-2 border-[#E87722]/50 bg-[#fff8f3] px-5 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/55">
                    Race-day bib · this event
                  </p>
                  <p className="font-display mt-1 text-4xl font-bold tabular-nums text-[#1E3A5F]">
                    {heroRaceDayBibs.join(" · ")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1E3A5F]/55">Races Entered</p>
            <ul className="mt-2 space-y-2">
              {runner.entries.map((e) => {
                const chipPrimary = primaryEntryForCarryOver(runner.entries, e);
                return (
                <li
                  key={e.id}
                  className={`rounded-xl border px-4 py-3 ${
                    activeEntryId === e.id ? "border-[#E87722] bg-[#fff8f3]" : "border-[#1E3A5F]/10 bg-[#fafbfc]"
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-[#1E3A5F]">{e.distance_label}</p>
                      <p className="text-xs text-[#1E3A5F]/55">
                        {e.entry_type === "roll_over" ? "Carry-over split" : "Primary"} ·{" "}
                        {e.entry_kind === "paid" ? "Paid" : "Comp / free"}
                        {e.paid_at ? ` · ${new Date(e.paid_at).toLocaleDateString()}` : ""}
                      </p>
                      {e.assigned_bib?.trim() ? (
                        <p className="mt-1 font-mono text-xs text-[#1E3A5F]/75">
                          Assigned race bib: <span className="font-semibold">{e.assigned_bib.trim()}</span>
                        </p>
                      ) : null}
                      {isCarryOverEntry(e) ? (
                        <p className="mt-2 max-w-md text-xs leading-snug text-[#1E3A5F]/70">
                          Same RFID chips as your primary race
                          {chipPrimary ? (
                            <>
                              :{" "}
                              <span className="font-semibold text-[#1E3A5F]">{chipPrimary.distance_label}</span>. Set chips
                              on that row only.
                            </>
                          ) : (
                            <> — one physical start; chips are stored on your primary entry.</>
                          )}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-stretch gap-2 sm:items-end">
                      {e.kiosk_checked_in_at ? (
                        <div className="flex flex-col items-end gap-1">
                          <button
                            type="button"
                            disabled
                            className="cursor-default rounded-md bg-[#E87722]/90 px-3 py-1.5 text-xs font-semibold text-white opacity-95"
                          >
                            Runner checked in
                          </button>
                          <span className="text-right text-[11px] text-[#1E3A5F]/55">
                            {new Date(e.kiosk_checked_in_at).toLocaleString(undefined, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={checkInPendingId === e.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            void confirmCheckInForEntry(e.id);
                          }}
                          className="rounded-md bg-[#E87722] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
                        >
                          {checkInPendingId === e.id ? "Saving…" : "Check In Runner"}
                        </button>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        {!isCarryOverEntry(e) ? (
                          <button
                            type="button"
                            onClick={() => selectEntryForTransponders(e)}
                            className="rounded-md border border-[#1E3A5F]/25 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722]"
                          >
                            Timing bib & RFID
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={withdrawPendingId === e.id}
                          onClick={() => void withdrawEntry(e.id)}
                          className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-50"
                        >
                          {withdrawPendingId === e.id ? "Withdrawing…" : "Withdraw"}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
              })}
            </ul>
          </div>

          {activeEntryId && activeEntry && !isCarryOverEntry(activeEntry) ? (
            <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1E3A5F]/55">
                Timing bib & RFID — {activeEntry.distance_label}
              </p>
              <p className="mt-1 text-xs text-[#1E3A5F]/60">
                Host timing bib is for this race only (sidepot / chip-timed events). Scan or type chip codes for this
                race. One primary race = one pair of chips at the line.
              </p>
              {hasCarryOverSplit ? (
                <p className="mt-2 text-xs text-[#1E3A5F]/75">
                  Carry-over splits you added from the qualifier use these same chips — you only run once; no separate
                  transponder row for splits.
                </p>
              ) : null}
              <div className="mt-4">
                <span className="text-sm font-medium text-[#1E3A5F]">Which number is this runner wearing?</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!runner.profile.pr_id?.trim()}
                    onClick={() => {
                      const prId = runner.profile.pr_id?.trim() ?? "";
                      if (!prId) return;
                      setBibMode("pr");
                      setAssignedRaceBib(prId);
                      setSaveError(null);
                    }}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      bibMode === "pr"
                        ? "bg-[#1E3A5F] text-white"
                        : "border border-[#1E3A5F]/25 bg-white text-[#1E3A5F] hover:border-[#E87722]"
                    }`}
                  >
                    PR ID{runner.profile.pr_id?.trim() ? ` (#${runner.profile.pr_id.trim()})` : " — none on file"}
                    <span className="ml-1.5 text-xs font-normal opacity-75">lifetime</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBibMode("raceday");
                      const prId = runner.profile.pr_id?.trim() ?? "";
                      if (prId && assignedRaceBib.trim() === prId) setAssignedRaceBib("");
                      setSaveError(null);
                    }}
                    className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                      bibMode === "raceday"
                        ? "bg-[#1E3A5F] text-white"
                        : "border border-[#1E3A5F]/25 bg-white text-[#1E3A5F] hover:border-[#E87722]"
                    }`}
                  >
                    Race-day bib #<span className="ml-1.5 text-xs font-normal opacity-75">this event only</span>
                  </button>
                </div>
                {bibMode === "pr" ? (
                  <p className="mt-2 text-sm text-[#1E3A5F]/75">
                    Racing as <span className="font-mono font-semibold">#{runner.profile.pr_id?.trim()}</span> — their
                    lifetime Peer Racing ID. Save below to lock it in for this race.
                  </p>
                ) : (
                  <label className="mt-3 block">
                    <span className="text-sm font-medium text-[#1E3A5F]">Assigned race bib #</span>
                    <input
                      type="text"
                      value={assignedRaceBib}
                      onChange={(e) => {
                        setAssignedRaceBib(e.target.value);
                        setSaveError(null);
                      }}
                      className="mt-2 w-full max-w-md rounded-lg border border-[#1E3A5F]/20 px-3 py-2 font-mono text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
                      placeholder="Host / timing bib (this event only)"
                      autoComplete="off"
                    />
                    <span className="mt-1 block text-xs text-[#1E3A5F]/55">
                      One bib per runner for the whole event weekend — every other runner must have a different number.
                      Leave blank to use only Peer Racing ID / on-file bib.
                    </span>
                  </label>
                )}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-[#1E3A5F]">Transponder 1</span>
                  <input
                    type="text"
                    value={t1}
                    onChange={(e) => {
                      setT1(e.target.value);
                      setSaveError(null);
                    }}
                    className="mt-2 w-full rounded-lg border border-[#1E3A5F]/20 px-3 py-2 font-mono text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
                    placeholder="Primary chip"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-[#1E3A5F]">Transponder 2</span>
                  <input
                    type="text"
                    value={t2}
                    onChange={(e) => {
                      setT2(e.target.value);
                      setSaveError(null);
                    }}
                    className="mt-2 w-full rounded-lg border border-[#1E3A5F]/20 px-3 py-2 font-mono text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </label>
              </div>
              {saveError ? (
                <div
                  className="mt-4 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                  role="alert"
                >
                  {saveError}
                </div>
              ) : null}
              <button
                type="button"
                disabled={savePending}
                onClick={() => void saveTransponders()}
                className="mt-6 rounded-md bg-[#1E3A5F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1E3A5F]/90 disabled:opacity-60"
              >
                {savePending ? "Saving…" : "Save race bib & transponders"}
              </button>
            </div>
          ) : null}

          {(runner.upsellDistances.length > 0 || runner.rollOverOptions.length > 0) && (
            <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#1E3A5F]/55">
                Add another race
              </p>
              <p className="text-xs text-[#1E3A5F]/60">
                Wallet applies first when available; otherwise Stripe opens for the card.
              </p>

              {runner.upsellDistances.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold text-[#1E3A5F]">Standalone races</p>
                  <p className="mt-1 text-xs text-[#1E3A5F]/65">
                    A separate start — this runner will get their own RFID pair for this distance at check-in.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {runner.upsellDistances.map((d) => (
                      <li
                        key={d.id}
                        className="flex flex-col justify-between gap-2 rounded-lg border border-[#1E3A5F]/10 bg-white px-4 py-3 sm:flex-row sm:items-center"
                      >
                        <div>
                          <span className="font-medium text-[#1E3A5F]">
                            {d.label}{" "}
                            <span className="text-sm font-normal text-[#1E3A5F]/65">
                              (${(d.entry_fee_cents / 100).toFixed(2)})
                            </span>
                          </span>
                          <p className="mt-1 text-xs text-[#1E3A5F]/55">Primary entry · own transponders</p>
                        </div>
                        <button
                          type="button"
                          disabled={addPending}
                          onClick={() => void addEntry({ distanceId: d.id, mode: "primary" })}
                          className="shrink-0 rounded-md bg-[#E87722] px-4 py-2 text-xs font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
                        >
                          {addPending ? "Working…" : "Add race"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {runner.rollOverOptions.length > 0 ? (
                <div>
                  <p className="text-sm font-semibold text-[#1E3A5F]">Carry-over splits (same chips)</p>
                  <p className="mt-1 text-xs text-[#1E3A5F]/65">
                    Splits from the Peer Racing Qualifier — one physical race; timing uses the same RFID chips already set
                    on the primary race. No second transponder assignment.
                  </p>
                  <ul className="mt-2 space-y-2">
                    {runner.rollOverOptions.map((r) => (
                      <li
                        key={r.targetDistanceId}
                        className="flex flex-col justify-between gap-2 rounded-lg border border-dashed border-[#E87722]/40 bg-[#fffaf5] px-4 py-3 sm:flex-row sm:items-center"
                      >
                        <div>
                          <span className="font-medium text-[#1E3A5F]">
                            {r.label}{" "}
                            <span className="text-sm font-normal text-[#1E3A5F]/65">
                              (${(r.entry_fee_cents / 100).toFixed(2)})
                            </span>
                          </span>
                          <p className="mt-1 text-xs text-[#1E3A5F]/55">Qualifier carry-over · shared RFID</p>
                        </div>
                        <button
                          type="button"
                          disabled={addPending}
                          onClick={() =>
                            void addEntry({
                              distanceId: r.targetDistanceId,
                              mode: "roll_over",
                              sourceDistanceId: r.sourceDistanceId,
                            })
                          }
                          className="shrink-0 rounded-md bg-[#E87722] px-4 py-2 text-xs font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
                        >
                          {addPending ? "Working…" : "Add carry-over"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-[#1E3A5F]/10 bg-[#fafbfc] px-4 py-4 sm:rounded-b-2xl">
              <button
                type="button"
                onClick={closeRunnerModal}
                className="w-full rounded-xl bg-[#E87722] px-6 py-3.5 text-base font-semibold text-white hover:bg-[#E87722]/90"
              >
                Done
              </button>
              <p className="mt-2 text-center text-xs leading-snug text-[#1E3A5F]/55">
                Closes this runner and clears the search — use when finished, or if you were only checking status.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
