"use client";

/**
 * Producer results console — runs the Peer Racing division algorithm on matched
 * finish times (CSV import or manual roster entry). Shows a live finisher list as
 * soon as any times exist; divisions and publish unlock at MIN_FINISHERS.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AlgorithmEntry } from "@/lib/algorithm";
import {
  computeConsoleResults,
  fmtTime,
  MIN_FINISHERS,
  type ConsoleComputation,
  type FinisherInput,
} from "@/lib/results-console/compute";
import { formatMs } from "@/lib/results-import/parse";
import type { DistancePayoutSettingsRow } from "@/lib/payout/types";
import { DivisionBadge, DIVISION_COLORS } from "@/components/results/DivisionBadge";

type DistanceOption = { id: string; label: string; entry_fee_cents: number };

type RealFinisher = FinisherInput & {
  entryId: string;
  userId: string | null;
  prId: string | null;
  timeMs: number;
  timeDisplay?: string;
  source?: string | null;
};

function fmtUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const fmtHours = (h: number) => fmtTime(h * 3600);

const inputClass =
  "mt-1 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

export function ResultsConsoleClient({
  eventId,
  distances,
}: {
  eventId: string;
  distances: DistanceOption[];
}) {
  const [selectedDistanceId, setSelectedDistanceId] = useState<string>(distances[0]?.id ?? "");
  const [selectedLabel, setSelectedLabel] = useState(distances[0]?.label ?? "");
  const [settings, setSettings] = useState<DistancePayoutSettingsRow | null>(null);
  const [liveFeeCents, setLiveFeeCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [realFinishers, setRealFinishers] = useState<RealFinisher[]>([]);
  const [registeredEntryCount, setRegisteredEntryCount] = useState(0);
  const [importedRowCount, setImportedRowCount] = useState(0);
  const [resultsPublishedAt, setResultsPublishedAt] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const [minPercentile, setMinPercentile] = useState(5);
  const [maxPercentile, setMaxPercentile] = useState(95);

  const [publishing, setPublishing] = useState(false);
  const [publishNotice, setPublishNotice] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  const loadDistance = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!selectedDistanceId) {
      setLoading(false);
      return;
    }
    if (!opts?.quiet) {
      setLoading(true);
      setLoadError(null);
      setPublishNotice(null);
      setPublishError(null);
    }
    try {
      const [payoutRes, dataRes] = await Promise.all([
        fetch(`/api/promoter/events/${eventId}/payout?distanceId=${encodeURIComponent(selectedDistanceId)}`),
        fetch(`/api/promoter/events/${eventId}/results-data?distanceId=${encodeURIComponent(selectedDistanceId)}`, {
          cache: "no-store",
        }),
      ]);
      const payoutJson = (await payoutRes.json()) as {
        ok?: boolean;
        error?: string;
        settings?: DistancePayoutSettingsRow | null;
        suggestedEntryCount?: number;
        suggestedFeeCents?: number;
        distance?: { label: string };
      };
      if (!payoutRes.ok || !payoutJson.ok) {
        setLoadError(payoutJson.error ?? "Could not load payout settings");
        return;
      }
      setSettings(payoutJson.settings ?? null);
      setLiveFeeCents(payoutJson.suggestedFeeCents ?? 0);
      if (payoutJson.distance?.label) setSelectedLabel(payoutJson.distance.label);

      const dataJson = (await dataRes.json()) as {
        ok?: boolean;
        error?: string;
        finishers?: RealFinisher[];
        importedRowCount?: number;
        registeredEntryCount?: number;
        resultsPublishedAt?: string | null;
        isDemo?: boolean;
      };
      if (!dataRes.ok || !dataJson.ok) {
        setLoadError(dataJson.error ?? "Could not load imported finish times");
        return;
      }
      setRealFinishers(dataJson.finishers ?? []);
      setImportedRowCount(dataJson.importedRowCount ?? 0);
      setRegisteredEntryCount(dataJson.registeredEntryCount ?? 0);
      setResultsPublishedAt(dataJson.resultsPublishedAt ?? null);
      setIsDemo(dataJson.isDemo === true);
    } catch {
      if (!opts?.quiet) setLoadError("Network error");
    } finally {
      if (!opts?.quiet) setLoading(false);
    }
  }, [eventId, selectedDistanceId]);

  useEffect(() => {
    void loadDistance();
  }, [loadDistance]);

  useEffect(() => {
    const refresh = () => void loadDistance({ quiet: true });
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(refresh, 20_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [loadDistance]);

  const hasLiveTimes = realFinishers.length > 0;
  const canRunAlgorithm = realFinishers.length >= MIN_FINISHERS;

  const userIdByAlgoId = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of realFinishers) {
      if (f.userId) m.set(f.id, f.userId);
    }
    return m;
  }, [realFinishers]);

  const computation = useMemo<ConsoleComputation | { error: string } | null>(() => {
    if (loading || !canRunAlgorithm) return null;
    return computeConsoleResults({
      rows: realFinishers,
      settings,
      distanceId: selectedDistanceId,
      liveFeeCents,
      registeredEntryCount,
      minPercentile,
      maxPercentile,
    });
  }, [
    loading,
    realFinishers,
    canRunAlgorithm,
    settings,
    selectedDistanceId,
    liveFeeCents,
    registeredEntryCount,
    minPercentile,
    maxPercentile,
  ]);

  async function publish(action: "publish" | "unpublish", forceUnpublish = false) {
    setPublishing(true);
    setPublishError(null);
    setPublishNotice(null);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/results-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          distance_id: selectedDistanceId,
          action,
          min_percentile: minPercentile,
          max_percentile: maxPercentile,
          ...(forceUnpublish ? { force_unpublish: true } : {}),
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        code?: string;
        blockers?: Array<{
          name: string;
          role: "racer" | "promoter";
          creditCents: number;
          balanceCents: number;
          shortfallCents: number;
        }>;
        publishedAt?: string;
        summary?: {
          resultsWritten: number;
          badgesAwarded: number;
          racersPaid?: number;
          walletCreditedCents?: number;
          promoterCreditedCents?: number;
        };
      };
      if (!res.ok || !json.ok) {
        if (json.code === "unpublish_wallet_spent" && json.blockers?.length) {
          const detail = json.blockers
            .slice(0, 4)
            .map((b) => {
              const role = b.role === "promoter" ? "Promoter" : "Racer";
              return `${role} ${b.name}: credited ${fmtUsd(b.creditCents)}, wallet now ${fmtUsd(b.balanceCents)}`;
            })
            .join(" · ");
          setPublishError(`${json.error ?? "Cannot unpublish."} ${detail}`);
        } else {
          setPublishError(json.error ?? `Error ${res.status}`);
        }
        return;
      }
      if (action === "publish") {
        setResultsPublishedAt(json.publishedAt ?? new Date().toISOString());
        const s = json.summary;
        const walletNote =
          s && (s.racersPaid ?? 0) > 0
            ? ` ${fmtUsd(s.walletCreditedCents ?? 0)} in winnings credited to ${s.racersPaid} racer${
                s.racersPaid === 1 ? "" : "s"
              }' wallets.`
            : "";
        const promoterNote =
          s && (s.promoterCreditedCents ?? 0) > 0
            ? ` ${fmtUsd(s.promoterCreditedCents ?? 0)} in event earnings credited to your wallet.`
            : "";
        setPublishNotice(
          s
            ? `Published — ${s.resultsWritten} results written, ${s.badgesAwarded} badges awarded.${walletNote}${promoterNote}`
            : "Published.",
        );
      } else {
        setResultsPublishedAt(null);
        setPublishNotice(
          forceUnpublish
            ? "Results force-unpublished (admin override) — wallet credits for this distance were clawed back."
            : "Results unpublished — racer pages, badges, wallet winnings, and promoter earnings for this distance are withdrawn.",
        );
      }
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPublishing(false);
    }
  }

  if (distances.length === 0) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Add at least one race distance on the event page before opening the results console.
      </p>
    );
  }

  const comp = computation && !("error" in computation) ? computation : null;
  const compError = computation && "error" in computation ? computation.error : null;

  return (
    <div className="space-y-8">
      {hasLiveTimes ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p>
              <span className="font-semibold">Live finish times.</span> {realFinishers.length} matched finisher
              {realFinishers.length === 1 ? "" : "s"} from roster entry and/or CSV import
              {importedRowCount > realFinishers.length
                ? ` (${importedRowCount - realFinishers.length} other imported rows are unmatched, ignored, or non-finishes)`
                : ""}
              . Updates automatically as times are added or changed — not published until you publish.
              {!canRunAlgorithm ? (
                <>
                  {" "}
                  Need at least {MIN_FINISHERS} finishers before divisions and publish unlock (
                  {realFinishers.length}/{MIN_FINISHERS} so far).
                </>
              ) : null}
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadDistance()}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:border-emerald-400"
              >
                Refresh
              </button>
              <Link
                href={`/promoter/events/${eventId}/results/import`}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:border-emerald-400"
              >
                Import CSV
              </Link>
              <Link
                href={`/promoter/events/${eventId}/roster`}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold text-emerald-900 hover:border-emerald-400"
              >
                Roster times
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[#1E3A5F]/15 bg-white px-4 py-4 text-sm text-[#1E3A5F]/80">
          <p className="font-semibold text-[#1E3A5F]">No finish times yet</p>
          <p className="mt-1">
            Enter times on the{" "}
            <Link href={`/promoter/events/${eventId}/roster`} className="font-semibold text-[#E87722] underline-offset-2 hover:underline">
              check-in roster
            </Link>{" "}
            or{" "}
            <Link
              href={`/promoter/events/${eventId}/results/import`}
              className="font-semibold text-[#E87722] underline-offset-2 hover:underline"
            >
              import a timing CSV
            </Link>
            . Finishers appear here live as soon as a time is saved — before results are published.
          </p>
        </div>
      )}

      {/* controls */}
      <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-[#1E3A5F]">
            Race distance
            <select
              className={inputClass}
              value={selectedDistanceId}
              onChange={(e) => {
                setSelectedDistanceId(e.target.value);
                const opt = distances.find((x) => x.id === e.target.value);
                if (opt) setSelectedLabel(opt.label);
              }}
            >
              {distances.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {hasLiveTimes ? (
            <div className="block text-sm font-medium text-[#1E3A5F]">
              Matched finishers
              <p className={`${inputClass} bg-[#fafbfc] tabular-nums`}>{realFinishers.length}</p>
            </div>
          ) : (
            <div className="block text-sm font-medium text-[#1E3A5F]">
              Registered entries
              <p className={`${inputClass} bg-[#fafbfc] tabular-nums`}>{registeredEntryCount}</p>
            </div>
          )}
          {canRunAlgorithm ? (
            <>
              <label className="block text-sm font-medium text-[#1E3A5F]">
                Slow-end cutoff (max percentile)
                <input
                  type="number"
                  min={50}
                  max={100}
                  className={`${inputClass} tabular-nums`}
                  value={maxPercentile}
                  onChange={(e) => setMaxPercentile(Math.min(100, Math.max(50, Number(e.target.value) || 95)))}
                />
              </label>
              <label className="block text-sm font-medium text-[#1E3A5F]">
                Fast-end cutoff (min percentile)
                <input
                  type="number"
                  min={0}
                  max={50}
                  className={`${inputClass} tabular-nums`}
                  value={minPercentile}
                  onChange={(e) => setMinPercentile(Math.min(50, Math.max(0, Number(e.target.value) || 0)))}
                />
              </label>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {comp ? (
            <span className="text-xs text-[#1E3A5F]/70">
              Pre-algorithm outlier scan suggests cutoffs{" "}
              <span className="font-mono font-semibold">
                [{comp.preAlgorithm.low}, {comp.preAlgorithm.high}]
              </span>
              {comp.preAlgorithm.low !== minPercentile || comp.preAlgorithm.high !== maxPercentile ? (
                <button
                  type="button"
                  className="ml-2 font-semibold text-[#E87722] underline underline-offset-2"
                  onClick={() => {
                    setMinPercentile(comp.preAlgorithm.low);
                    setMaxPercentile(comp.preAlgorithm.high);
                  }}
                >
                  Apply
                </button>
              ) : (
                <span className="ml-2 text-emerald-800">applied</span>
              )}
            </span>
          ) : null}
        </div>
        {!settings && !loading ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            No saved payout settings for {selectedLabel} — using defaults, so dollar amounts are illustrative. Set and
            save them on the payout calculator to see real money here.
          </p>
        ) : null}
        {loadError ? (
          <p className="mt-3 text-sm text-red-700">
            {loadError}{" "}
            <button type="button" className="font-semibold underline" onClick={() => void loadDistance()}>
              Retry
            </button>
          </p>
        ) : null}
      </section>

      {loading ? <p className="text-sm text-[#1E3A5F]/70">Loading finish times…</p> : null}
      {compError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{compError}</p>
      ) : null}

      {hasLiveTimes && !canRunAlgorithm ? (
        <LiveFinisherList
          finishers={realFinishers}
          raceLabel={selectedLabel}
          eventId={eventId}
        />
      ) : null}

      {comp ? (
        <>
          {/* badge rail */}
          <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Badges In Play — {selectedLabel}</h2>
            <p className="mt-1 text-xs text-[#1E3A5F]/65">
              Every finisher earns their division badge; paid places also win money. Incentive pools award their own
              badge alongside the main one.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-6">
              {[...comp.main.winners.keys()].map((div, i) => (
                <div key={div} className="flex flex-col items-center gap-1">
                  <DivisionBadge division={div} size={76} />
                  <span className="text-xs font-medium text-[#1E3A5F]/70">
                    {comp.main.winners.get(div)?.length ?? 0} runners
                  </span>
                </div>
              ))}
              {comp.incentives.map((pool) =>
                [...pool.result.winners.keys()].map((div, i) => (
                  <div key={`${pool.key}-${div}`} className="flex flex-col items-center gap-1">
                    <DivisionBadge division={div} variant={pool.variant} size={64} />
                    <span className="text-xs font-medium text-[#1E3A5F]/70">
                      {pool.title} · {pool.result.winners.get(div)?.length ?? 0}
                    </span>
                  </div>
                )),
              )}
            </div>
          </section>

          {/* summary + timeline */}
          <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Finishers</p>
                <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">{comp.finishers}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Divisions</p>
                <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">{comp.main.winners.size}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Main payouts</p>
                <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">{fmtUsd(comp.totalMainPaidCents)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">Incentive payouts</p>
                <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
                  {fmtUsd(comp.totalIncentivePaidCents)}
                </p>
              </div>
              <div className="rounded-lg border border-[#E87722]/30 bg-[#E87722]/5 px-3 py-2 sm:col-span-2 lg:col-span-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#E87722]">Total payout</p>
                <p className="font-display mt-1 text-2xl font-bold text-[#1E3A5F]">
                  {fmtUsd(comp.totalMainPaidCents + comp.totalIncentivePaidCents)}
                </p>
              </div>
            </div>

            <DivisionTimeline comp={comp} />

            {comp.warnings.length > 0 ? (
              <ul className="mt-4 list-inside list-disc text-xs text-amber-900">
                {comp.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* main divisions */}
          <section className="space-y-4">
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Peer Team Divisions</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {[...comp.main.winners.entries()].map(([div, runners], i) => {
                const pay = comp.payoutByDivision.get(div);
                const lower = comp.main.divisionsH[i];
                const upper = comp.main.divisionsH[i + 1];
                return (
                  <div key={div} className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-4">
                      <DivisionBadge division={div} size={56} />
                      <div>
                        <p className="font-display text-base font-semibold text-[#1E3A5F]">{div}</p>
                        <p className="text-xs text-[#1E3A5F]/60">
                          {fmtHours(lower)} – {upper !== undefined ? fmtHours(upper) : "finish"} · {runners.length}{" "}
                          runners
                        </p>
                        {pay ? (
                          <p className="text-xs text-[#1E3A5F]/60">
                            Pool {fmtUsd(pay.poolCents)} · Paid {fmtUsd(pay.placesPaidTotalCents)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <RunnerTable runners={runners} payoutOf={(e) => e.payout} />
                  </div>
                );
              })}
            </div>
          </section>

          {/* incentive pools */}
          {comp.incentives.map((pool, poolIdx) => (
            <section key={pool.key} className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">{pool.title} Divisions</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {[...pool.result.winners.entries()].map(([div, runners], i) => {
                  const pay = pool.payoutDivisions.find((p) => p.label === div);
                  const lower = pool.result.divisionsH[i];
                  const upper = pool.result.divisionsH[i + 1];
                  return (
                    <div key={div} className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-4">
                        <DivisionBadge division={div} variant={pool.variant} size={56} />
                        <div>
                          <p className="font-display text-base font-semibold text-[#1E3A5F]">
                            {div} <span className="text-xs font-normal text-[#1E3A5F]/55">({pool.title})</span>
                          </p>
                          <p className="text-xs text-[#1E3A5F]/60">
                            {fmtHours(lower)} – {upper !== undefined ? fmtHours(upper) : "finish"} · {runners.length}{" "}
                            runners
                          </p>
                          {pay ? (
                            <p className="text-xs text-[#1E3A5F]/60">
                              Pool {fmtUsd(pay.poolCents)} · Paid {fmtUsd(pay.placesPaidTotalCents)}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <RunnerTable runners={runners} payoutOf={(e) => e.getIncentivePayout(poolIdx)} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* full finisher list */}
          <FullFinisherList
            comp={comp}
            raceLabel={selectedLabel}
            eventId={eventId}
            userIdByAlgoId={userIdByAlgoId}
          />

          {/* publish */}
          {isDemo ? (
            <section className="rounded-xl border border-violet-200 bg-violet-50 p-6">
              <p className="font-display text-base font-semibold text-violet-950">
                Results preview only — {selectedLabel}
              </p>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-violet-900/90">
                This is a demo race. Divisions and payout math above are live from your finish times and payout
                settings — exactly what a producer would see before publish — but nothing is written to official
                results, badges, or wallets. Delete the demo when the walkthrough is done.
              </p>
            </section>
          ) : (
          <section className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-base font-semibold text-[#1E3A5F]">
                  Publish results — {selectedLabel}
                </p>
                <p className="mt-1 max-w-xl text-xs text-[#1E3A5F]/65">
                  {canRunAlgorithm
                    ? "Publishing recomputes divisions and payouts on the server from the live finish times and your saved payout settings, writes the official results, and awards badges to each racer's trophy case."
                    : `Publish unlocks once at least ${MIN_FINISHERS} finishers have times for this distance.`}
                </p>
                {resultsPublishedAt ? (
                  <p className="mt-2 text-xs font-semibold text-emerald-800">
                    Published {new Date(resultsPublishedAt).toLocaleString()}. Re-publishing replaces the live
                    results.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {resultsPublishedAt ? (
                  <button
                    type="button"
                    disabled={publishing}
                    onClick={() => void publish("unpublish")}
                    className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Unpublish
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canRunAlgorithm || publishing}
                  onClick={() => {
                    if (
                      window.confirm(
                        resultsPublishedAt
                          ? "Re-publish results for this distance? The current live results will be replaced."
                          : "Publish results for this distance? Racers will see their division, place, payout, and badge.",
                      )
                    ) {
                      void publish("publish");
                    }
                  }}
                  className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
                    canRunAlgorithm
                      ? "bg-[#E87722] hover:bg-[#E87722]/90"
                      : "cursor-not-allowed bg-[#1E3A5F]/30"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {publishing ? "Publishing…" : resultsPublishedAt ? "Re-publish results" : "Publish results"}
                </button>
              </div>
            </div>
            {publishError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                {publishError}
              </p>
            ) : null}
            {publishNotice ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                {publishNotice}
              </p>
            ) : null}
          </section>
          )}
        </>
      ) : null}
    </div>
  );
}

function sourceLabel(source: string | null | undefined): string {
  if (!source) return "—";
  if (source === "manual:roster") return "Roster";
  if (source.startsWith("manual:")) return "Manual";
  return "CSV";
}

/** Live finisher table shown before enough runners exist to run divisions. */
function LiveFinisherList({
  finishers,
  raceLabel,
  eventId,
}: {
  finishers: RealFinisher[];
  raceLabel: string;
  eventId: string;
}) {
  return (
    <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
      <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Live Finishers — {raceLabel}</h2>
      <p className="mt-1 text-xs text-[#1E3A5F]/65">
        Provisional list — updates as times are entered on the roster or imported from timing. Divisions and payouts
        appear once {MIN_FINISHERS} or more finishers have times.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-[#1E3A5F]/10">
        <table className="w-full text-sm">
          <thead className="bg-[#fafbfc] text-left text-xs uppercase tracking-wide text-[#1E3A5F]/55">
            <tr>
              <th className="px-3 py-2 font-semibold">Place</th>
              <th className="px-3 py-2 font-semibold">Bib</th>
              <th className="px-3 py-2 font-semibold">PR ID</th>
              <th className="px-3 py-2 font-semibold">Runner</th>
              <th className="px-3 py-2 text-right font-semibold">Time</th>
              <th className="px-3 py-2 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E3A5F]/10">
            {finishers.map((f, idx) => (
              <tr key={f.entryId}>
                <td className="px-3 py-2 tabular-nums font-semibold text-[#1E3A5F]">{idx + 1}</td>
                <td className="px-3 py-2 font-mono text-xs text-[#1E3A5F]/80">{f.bib || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-[#1E3A5F]/80">{f.prId ?? "—"}</td>
                <td className="px-3 py-2 text-[#1E3A5F]">
                  {f.userId ? (
                    <Link
                      href={`/promoter/events/${eventId}/racer/${f.userId}`}
                      className="font-medium underline-offset-2 hover:text-[#E87722] hover:underline"
                    >
                      {f.first} {f.last}
                    </Link>
                  ) : (
                    <>
                      {f.first} {f.last}
                    </>
                  )}
                  <span className="ml-2 text-xs text-[#1E3A5F]/50">
                    {f.sex === "Female" ? "F" : "M"}
                    {f.military ? " · MIL" : ""}
                    {f.age ? ` · ${f.age}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-sm tabular-nums font-semibold text-[#1E3A5F]">
                  {f.timeDisplay ?? formatMs(f.timeMs)}
                </td>
                <td className="px-3 py-2 text-xs text-[#1E3A5F]/65">{sourceLabel(f.source)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RunnerTable({
  runners,
  payoutOf,
}: {
  runners: AlgorithmEntry[];
  payoutOf: (e: AlgorithmEntry) => number;
}) {
  return (
    <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-[#1E3A5F]/10">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#fafbfc] text-left text-xs uppercase tracking-wide text-[#1E3A5F]/55">
          <tr>
            <th className="px-3 py-2 font-semibold">Place</th>
            <th className="px-3 py-2 font-semibold">Bib</th>
            <th className="px-3 py-2 font-semibold">Runner</th>
            <th className="px-3 py-2 text-right font-semibold">Time</th>
            <th className="px-3 py-2 text-right font-semibold">Payout</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E3A5F]/10">
          {runners.map((e, idx) => {
            const amount = payoutOf(e);
            return (
              <tr key={e.id} className={amount > 0 ? "bg-[#fff9f5]" : undefined}>
                <td className="px-3 py-1.5 tabular-nums text-[#1E3A5F]/80">{idx + 1}</td>
                <td className="px-3 py-1.5 font-mono text-xs text-[#1E3A5F]/70">{e.bibNumber}</td>
                <td className="px-3 py-1.5 text-[#1E3A5F]">
                  {e.firstName} {e.lastName}
                  <span className="ml-2 text-xs text-[#1E3A5F]/50">
                    {e.sex === "Female" ? "F" : "M"}
                    {e.isMilitary() ? " · MIL" : ""}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-[#1E3A5F]/80">
                  {e.timeRaw}
                </td>
                <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#1E3A5F]">
                  {amount > 0 ? fmtUsd(amount) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function csvField(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Full field in overall placing order with division marking, division place, and
 * payouts — plus CSV export of the same rows.
 */
function FullFinisherList({
  comp,
  raceLabel,
  eventId,
  userIdByAlgoId,
}: {
  comp: ConsoleComputation;
  raceLabel: string;
  eventId: string;
  userIdByAlgoId: Map<string, string>;
}) {
  // Main division + place per runner, derived from the algorithm's winner buckets
  // (entry.peerRacingRank can be overwritten by incentive runs, so don't rely on it here).
  const mainPlacing = new Map<string, { division: string; place: number }>();
  for (const [div, runners] of comp.main.winners) {
    runners.forEach((e, idx) => mainPlacing.set(e.id, { division: div, place: idx + 1 }));
  }
  const incentivePlacing = comp.incentives.map((pool) => {
    const m = new Map<string, { division: string; place: number }>();
    for (const [div, runners] of pool.result.winners) {
      runners.forEach((e, idx) => m.set(e.id, { division: div, place: idx + 1 }));
    }
    return m;
  });

  function exportCsv() {
    const header = [
      "Overall Place",
      "Bib",
      "PR ID",
      "First Name",
      "Last Name",
      "Age",
      "Sex",
      "Military",
      "Finish Time",
      "Division",
      "Division Place",
      "Payout (USD)",
      ...comp.incentives.flatMap((pool) => [`${pool.title} Division`, `${pool.title} Payout (USD)`]),
    ];
    const lines = [header.map(csvField).join(",")];
    for (const e of comp.entries) {
      const placing = mainPlacing.get(e.id);
      const row: (string | number)[] = [
        e.overallRank,
        e.bibNumber,
        e.id,
        e.firstName,
        e.lastName,
        e.age,
        e.sex,
        e.isMilitary() ? "Yes" : "No",
        e.timeRaw,
        placing?.division ?? "",
        placing?.place ?? "",
        (e.payout / 100).toFixed(2),
      ];
      comp.incentives.forEach((pool, i) => {
        const ip = incentivePlacing[i].get(e.id);
        row.push(ip ? `${ip.division} ${ip.place}` : "");
        row.push((e.getIncentivePayout(i) / 100).toFixed(2));
      });
      lines.push(row.map(csvField).join(","));
    }
    const blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peer-racing-results-${raceLabel.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Full Finisher List</h2>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">
            Every finisher in overall placing order — {comp.entries.length} runners. Paid rows highlighted.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A5F]/90"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4 max-h-[40rem] overflow-y-auto rounded-lg border border-[#1E3A5F]/10">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#fafbfc] text-left text-xs uppercase tracking-wide text-[#1E3A5F]/55">
            <tr>
              <th className="px-3 py-2 font-semibold">Place</th>
              <th className="px-3 py-2 font-semibold">Division</th>
              <th className="px-3 py-2 font-semibold">Bib</th>
              <th className="px-3 py-2 font-semibold">PR ID</th>
              <th className="px-3 py-2 font-semibold">Runner</th>
              <th className="px-3 py-2 text-right font-semibold">Time</th>
              <th className="px-3 py-2 text-right font-semibold">Div. place</th>
              <th className="px-3 py-2 text-right font-semibold">Payout</th>
              {comp.incentives.map((pool) => (
                <th key={pool.key} className="px-3 py-2 text-right font-semibold">
                  {pool.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E3A5F]/10">
            {comp.entries.map((e) => {
              const placing = mainPlacing.get(e.id);
              const colors = placing ? DIVISION_COLORS[placing.division] : undefined;
              const totalIncentive = comp.incentives.reduce(
                (sum, _pool, i) => sum + e.getIncentivePayout(i),
                0,
              );
              return (
                <tr key={e.id} className={e.payout > 0 || totalIncentive > 0 ? "bg-[#fff9f5]" : undefined}>
                  <td className="px-3 py-1.5 font-semibold tabular-nums text-[#1E3A5F]">{e.overallRank}</td>
                  <td className="px-3 py-1.5">
                    {placing ? (
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white"
                        style={{ backgroundColor: colors?.dark }}
                      >
                        {placing.division.toUpperCase()}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-[#1E3A5F]/70">{e.bibNumber}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-[#1E3A5F]/70">{e.id}</td>
                  <td className="px-3 py-1.5 text-[#1E3A5F]">
                    {userIdByAlgoId.get(e.id) ? (
                      <Link
                        href={`/promoter/events/${eventId}/racer/${userIdByAlgoId.get(e.id)}`}
                        className="font-medium text-[#1E3A5F] underline-offset-2 hover:text-[#E87722] hover:underline"
                      >
                        {e.firstName} {e.lastName}
                      </Link>
                    ) : (
                      <>
                        {e.firstName} {e.lastName}
                      </>
                    )}
                    <span className="ml-2 text-xs text-[#1E3A5F]/50">
                      {e.sex === "Female" ? "F" : "M"}
                      {e.isMilitary() ? " · MIL" : ""} · {e.age}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-[#1E3A5F]/80">
                    {e.timeRaw}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[#1E3A5F]/80">
                    {placing ? `${placing.division} ${placing.place}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#1E3A5F]">
                    {e.payout > 0 ? fmtUsd(e.payout) : "—"}
                  </td>
                  {comp.incentives.map((pool, i) => {
                    const amount = e.getIncentivePayout(i);
                    return (
                      <td
                        key={pool.key}
                        className="px-3 py-1.5 text-right font-semibold tabular-nums text-[#1E3A5F]"
                      >
                        {amount > 0 ? fmtUsd(amount) : "—"}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Time-axis strip: colored division bands with runner dots — the "how the chips fell" view. */
function DivisionTimeline({ comp }: { comp: ConsoleComputation }) {
  const minH = comp.main.diagnostics.rawStatsH.min;
  const maxH = comp.main.diagnostics.rawStatsH.max;
  const span = Math.max(maxH - minH, 0.01);
  const x = (h: number) => 24 + ((h - minH) / span) * 752;

  const divisionNames = [...comp.main.winners.keys()];
  const bands = divisionNames.map((name, i) => {
    const start = comp.main.divisionsH[i];
    const end = comp.main.divisionsH[i + 1] ?? maxH;
    const runners = comp.main.winners.get(name)?.length ?? 0;
    const widthPct = ((Math.min(end, maxH) - start) / span) * 100;
    return { name, start, end, runners, widthPct: Math.max(widthPct, 0.5) };
  });

  return (
    <div className="mt-6 rounded-xl border border-[#1E3A5F]/10 bg-white p-4 sm:p-5">
      <p className="text-sm font-semibold text-[#1E3A5F]">Field Timeline</p>
      <p className="mt-0.5 text-xs text-[#1E3A5F]/65">How finishers spread across division bands</p>

      {/* Visual-only chart: bands, dots, and axis — no labels on the timeline itself. */}
      <svg
        viewBox="0 0 800 52"
        className="mt-4 w-full"
        role="img"
        aria-label="Division bands across finish times"
      >
        {bands.map((b) => {
          const c = DIVISION_COLORS[b.name] ?? DIVISION_COLORS.Echo;
          const bx = x(b.start);
          return (
            <g key={b.name}>
              <rect
                x={bx}
                y={8}
                width={Math.max(x(Math.min(b.end, maxH)) - bx, 2)}
                height={32}
                fill={c.base}
                opacity={0.2}
                rx={2}
              />
              <line x1={bx} y1={6} x2={bx} y2={42} stroke={c.dark} strokeWidth={1.25} opacity={0.55} />
            </g>
          );
        })}
        {comp.entries.map((e, i) => (
          <circle
            key={e.id}
            cx={x(e.timeH())}
            cy={24 + ((i * 7919) % 11) - 5}
            r={2.4}
            fill={e.payout > 0 ? "#E87722" : "#1E3A5F"}
            opacity={e.payout > 0 ? 0.95 : 0.4}
          />
        ))}
        <line x1={24} y1={44} x2={776} y2={44} stroke="#1E3A5F" strokeWidth={1} opacity={0.2} />
        <text x={24} y={52} fontSize={10} fill="#1E3A5F" opacity={0.7}>
          {fmtHours(minH)}
        </text>
        <text x={776} y={52} fontSize={10} fill="#1E3A5F" opacity={0.7} textAnchor="end">
          {fmtHours(maxH)}
        </text>
      </svg>

      {/* Proportional color bar mirrors band widths on the timeline. */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full ring-1 ring-[#1E3A5F]/10">
        {bands.map((b) => {
          const c = DIVISION_COLORS[b.name] ?? DIVISION_COLORS.Echo;
          return (
            <div
              key={`bar-${b.name}`}
              className="h-full min-w-[2px]"
              style={{ width: `${b.widthPct}%`, backgroundColor: c.base }}
              title={`${b.name}: ${fmtHours(b.start)} – ${fmtHours(Math.min(b.end, maxH))}`}
            />
          );
        })}
      </div>

      {/* Readable division chips — never overlap, full cutoff + count. */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {bands.map((b) => {
          const c = DIVISION_COLORS[b.name] ?? DIVISION_COLORS.Echo;
          return (
            <div
              key={`chip-${b.name}`}
              className="rounded-lg border px-3 py-2.5"
              style={{ borderColor: `${c.base}55`, backgroundColor: `${c.base}12` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                  style={{ backgroundColor: c.base }}
                  aria-hidden
                />
                <p className="text-sm font-semibold text-[#1E3A5F]">{b.name}</p>
              </div>
              <p className="mt-1 text-xs tabular-nums text-[#1E3A5F]/75">
                from <span className="font-medium text-[#1E3A5F]">{fmtHours(b.start)}</span>
              </p>
              <p className="text-xs text-[#1E3A5F]/55">
                {b.runners} {b.runners === 1 ? "finisher" : "finishers"}
              </p>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[#1E3A5F]/55">
        Each dot is a finisher; orange dots are in the money. Division cutoffs and counts are listed below — nothing is
        drawn on top of the timeline.
      </p>
    </div>
  );
}
