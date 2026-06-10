"use client";

/**
 * Producer results console — runs the Peer Racing division algorithm on a field of
 * finishers, with "tweak the ends" percentile controls, division badges, and payout
 * amounts sourced from the producer's saved payout settings (lib/payout — money is
 * defined once, on the payout calculator).
 *
 * Currently previews with generated sample finishers; the finish-time import
 * (results pipeline) plugs real data into the same console.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AlgorithmEntry,
  filterIncentiveEntries,
  runAlgorithm,
  runPreAlgorithm,
  sortEntries,
} from "@/lib/algorithm";
import type { AlgorithmRunResult, PayoutSource } from "@/lib/algorithm";
import { calculateEventPayout, defaultDistancePayoutSettings } from "@/lib/payout";
import type {
  DistancePayoutSettingsRow,
  DivisionPayoutResult,
  PayoutCalculationInput,
} from "@/lib/payout/types";
import { DivisionBadge, DIVISION_COLORS } from "@/components/results/DivisionBadge";
import type { BadgeVariant } from "@/components/results/DivisionBadge";

const DIVISION_NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] as const;
const SCHEDULE_PLACES_TO_PAY = 12;

type DistanceOption = { id: string; label: string; entry_fee_cents: number };

type SampleRow = {
  id: string;
  bib: string;
  first: string;
  last: string;
  age: number;
  sex: "Male" | "Female";
  timeS: number;
  military: boolean;
};

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Avery", "Blake", "Casey", "Drew", "Emery", "Finley", "Gray", "Harper", "Indy", "Jordan", "Kai", "Logan", "Morgan", "Nico", "Oakley", "Parker", "Quinn", "Riley", "Sage", "Taylor"];
const LAST = ["Adams", "Brooks", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Hayes", "Irwin", "James", "Kelly", "Lopez", "Mason", "Nguyen", "Ortiz", "Price", "Reed", "Smith", "Torres", "Walsh"];

function generateSampleRows(count: number, seed: number): SampleRow[] {
  const rand = mulberry32(seed);
  const randNormal = () => {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const rows: SampleRow[] = [];
  for (let i = 0; i < count; i++) {
    let hours = 2.2 * Math.exp(0.22 * randNormal());
    if (i < Math.max(1, Math.round(count * 0.02))) hours = 1.15 + 0.06 * rand(); // elites
    if (i >= count - Math.max(1, Math.round(count * 0.03))) hours = 5.0 + 1.0 * rand(); // walkers
    rows.push({
      id: `PR${String(i + 1).padStart(4, "0")}`,
      bib: String(100 + i),
      first: FIRST[Math.floor(rand() * FIRST.length)],
      last: LAST[Math.floor(rand() * LAST.length)],
      age: 16 + Math.floor(rand() * 62),
      sex: rand() < 0.48 ? "Female" : "Male",
      timeS: Math.max(3600, Math.round(hours * 3600)),
      military: rand() < 0.15,
    });
  }
  return rows;
}

function fmtUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtTime(totalSeconds: number) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const fmtHours = (h: number) => fmtTime(h * 3600);

type IncentivePool = {
  key: "female" | "military";
  title: string;
  variant: BadgeVariant;
  criteria: "female" | "military";
  divisionCount: number;
  payoutDivisions: DivisionPayoutResult[];
};

type ConsoleComputation = {
  finishers: number;
  payoutByDivision: Map<string, DivisionPayoutResult>;
  main: AlgorithmRunResult;
  incentives: (IncentivePool & { result: AlgorithmRunResult })[];
  preAlgorithm: { low: number; high: number };
  totalMainPaidCents: number;
  totalIncentivePaidCents: number;
  warnings: string[];
  entries: AlgorithmEntry[];
};

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

  const [sampleSize, setSampleSize] = useState(100);
  const [seed, setSeed] = useState(42);
  const [minPercentile, setMinPercentile] = useState(5);
  const [maxPercentile, setMaxPercentile] = useState(95);

  const loadDistance = useCallback(async () => {
    if (!selectedDistanceId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/promoter/events/${eventId}/payout?distanceId=${encodeURIComponent(selectedDistanceId)}`,
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        settings?: DistancePayoutSettingsRow | null;
        suggestedEntryCount?: number;
        suggestedFeeCents?: number;
        distance?: { label: string };
      };
      if (!res.ok || !json.ok) {
        setLoadError(json.error ?? "Could not load payout settings");
        return;
      }
      setSettings(json.settings ?? null);
      setLiveFeeCents(json.suggestedFeeCents ?? 0);
      if (json.distance?.label) setSelectedLabel(json.distance.label);
      const live = json.suggestedEntryCount ?? 0;
      setSampleSize(live >= 10 ? live : 100);
    } catch {
      setLoadError("Network error");
    } finally {
      setLoading(false);
    }
  }, [eventId, selectedDistanceId]);

  useEffect(() => {
    void loadDistance();
  }, [loadDistance]);

  const sampleRows = useMemo(
    () => generateSampleRows(Math.max(0, Math.min(1000, sampleSize)), seed),
    [sampleSize, seed],
  );

  const computation = useMemo<ConsoleComputation | { error: string } | null>(() => {
    if (loading) return null;
    if (sampleRows.length < 5) {
      return { error: "Need at least 5 finishers to compute divisions." };
    }

    const d = settings ?? {
      ...defaultDistancePayoutSettings(selectedDistanceId),
      entry_fee_cents_override: null,
      entry_count_override: null,
    };

    const finishers = sampleRows.length;
    const femaleCount = sampleRows.filter((r) => r.sex === "Female").length;
    const militaryCount = sampleRows.filter((r) => r.military).length;
    const feeCents = d.entry_fee_cents_override ?? liveFeeCents;
    const divisionCount = Math.min(5, Math.max(1, d.division_count));
    const divisionLabels = [...DIVISION_NAMES.slice(0, divisionCount)];

    const input: PayoutCalculationInput = {
      entryCount: d.entry_count_override ?? finishers,
      entryFeeCents: feeCents,
      processingFeeFraction: Number(d.processing_fee_fraction),
      prHoldingFraction: Number(d.pr_holding_fraction),
      producerFractionOfPrHolding: Number(d.producer_fraction_of_pr_holding),
      trueAddedMoneyCents: d.true_added_money_cents,
      femaleIncentiveFromRacersPotCents: d.female_incentive_cents ?? 0,
      femaleIncentiveDivisionCount: d.female_incentive_division_count ?? 1,
      femaleIncentivePlacesToPay: d.female_incentive_places_to_pay ?? 12,
      femaleIncentiveDivisionLabels: [...DIVISION_NAMES.slice(0, d.female_incentive_division_count ?? 1)],
      femaleIncentiveScheduleMode: d.female_incentive_schedule_mode ?? "auto",
      femaleIncentiveManualBracket: d.female_incentive_manual_bracket ?? undefined,
      femaleIncentiveBracketEntryCount: femaleCount,
      militaryIncentiveFromRacersPotCents: d.military_incentive_cents ?? 0,
      militaryIncentiveDivisionCount: d.military_incentive_division_count ?? 1,
      militaryIncentivePlacesToPay: d.military_incentive_places_to_pay ?? 12,
      militaryIncentiveDivisionLabels: [...DIVISION_NAMES.slice(0, d.military_incentive_division_count ?? 1)],
      militaryIncentiveScheduleMode: d.military_incentive_schedule_mode ?? "auto",
      militaryIncentiveManualBracket: d.military_incentive_manual_bracket ?? undefined,
      militaryIncentiveBracketEntryCount: militaryCount,
      eliteDivisionCarveFromPoolCents: d.elite_division_carve_cents,
      divisionCount,
      eliteDivisionIndex: Math.min(divisionCount - 1, Math.max(0, d.elite_division_index)),
      scheduleMode: d.schedule_mode,
      manualBracket: d.manual_bracket ?? undefined,
      placesToPay: SCHEDULE_PLACES_TO_PAY,
      divisionLabels,
    };

    let payout;
    try {
      payout = calculateEventPayout(input);
    } catch {
      return { error: "Payout calculation failed — check the payout settings for this distance." };
    }

    const incentivePools: IncentivePool[] = [];
    if ((d.female_incentive_cents ?? 0) > 0 && payout.femaleIncentiveDivisions.length > 0) {
      incentivePools.push({
        key: "female",
        title: "Female incentive",
        variant: "female",
        criteria: "female",
        divisionCount: d.female_incentive_division_count ?? 1,
        payoutDivisions: payout.femaleIncentiveDivisions,
      });
    }
    if ((d.military_incentive_cents ?? 0) > 0 && payout.militaryIncentiveDivisions.length > 0) {
      incentivePools.push({
        key: "military",
        title: "Military incentive",
        variant: "military",
        criteria: "military",
        divisionCount: d.military_incentive_division_count ?? 1,
        payoutDivisions: payout.militaryIncentiveDivisions,
      });
    }

    // Adapter: the algorithm reads division counts + per-place amounts straight from
    // the producer's payout calculation — money is never defined twice.
    const toAmounts = (divs: DivisionPayoutResult[]) => {
      const rec: Record<string, number[]> = {};
      for (const dv of divs) {
        rec[dv.label] = dv.places.filter((p) => p.amountCents > 0).map((p) => p.amountCents);
      }
      return rec;
    };
    const mainAmounts = toAmounts(payout.divisions);
    const incentiveAmounts = incentivePools.map((p) => toAmounts(p.payoutDivisions));
    const source: PayoutSource = {
      numDivisions: (run = null) => (run == null ? divisionCount : incentivePools[run].divisionCount),
      payout: (run = null) => (run == null ? mainAmounts : incentiveAmounts[run]),
    };

    const entries = sampleRows.map(
      (r) =>
        new AlgorithmEntry(r.id, r.bib, r.first, r.last, r.age, r.sex, r.timeS, -1, "", fmtTime(r.timeS), r.military),
    );
    sortEntries(entries);

    const preAlg = runPreAlgorithm(entries);

    try {
      const main = runAlgorithm(
        entries,
        { max_percentile: maxPercentile, min_percentile: minPercentile },
        source,
      );

      const incentives = incentivePools.map((pool, i) => {
        const subset = filterIncentiveEntries(entries, pool.criteria);
        const result = runAlgorithm(
          subset,
          { max_percentile: maxPercentile, min_percentile: minPercentile },
          source,
          i,
        );
        return { ...pool, result };
      });

      let totalMainPaidCents = 0;
      let totalIncentivePaidCents = 0;
      entries.forEach((e) => {
        totalMainPaidCents += e.payout;
        totalIncentivePaidCents += e.incentivePayout1 + e.incentivePayout2 + e.incentivePayout3;
      });

      return {
        finishers,
        payoutByDivision: new Map(payout.divisions.map((dv) => [dv.label, dv])),
        main,
        incentives,
        preAlgorithm: { low: preAlg.lowPercentileCutoff, high: preAlg.highPercentileCutoff },
        totalMainPaidCents,
        totalIncentivePaidCents,
        warnings: payout.warnings,
        entries,
      };
    } catch {
      return { error: "Algorithm failed on this field — try different percentile cutoffs." };
    }
  }, [loading, sampleRows, settings, selectedDistanceId, liveFeeCents, minPercentile, maxPercentile]);

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
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span className="font-semibold">Sample data preview.</span> Finishers below are generated so you can explore
        the console. Importing real finish times is the next build step — this same console will run on them.
      </div>

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
          <label className="block text-sm font-medium text-[#1E3A5F]">
            Sample finishers
            <input
              type="number"
              min={5}
              max={1000}
              className={`${inputClass} tabular-nums`}
              value={sampleSize}
              onChange={(e) => setSampleSize(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
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
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-md border border-[#1E3A5F]/25 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
          >
            Shuffle sample field
          </button>
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

      {loading ? <p className="text-sm text-[#1E3A5F]/70">Loading payout settings…</p> : null}
      {compError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{compError}</p>
      ) : null}

      {comp ? (
        <>
          {/* badge rail */}
          <section className="rounded-xl border border-[#1E3A5F]/10 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Badges in play — {selectedLabel}</h2>
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
            <div className="grid gap-4 sm:grid-cols-4">
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
            <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Peer Team divisions</h2>
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
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">{pool.title} divisions</h2>
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
          <FullFinisherList comp={comp} raceLabel={selectedLabel} />

          {/* publish (pipeline next) */}
          <section className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-display text-base font-semibold text-[#1E3A5F]">Publish results</p>
                <p className="mt-1 max-w-xl text-xs text-[#1E3A5F]/65">
                  Publishing locks divisions and payouts, awards badges to each racer&apos;s trophy case, and opens the
                  gamified results pages. Arrives with the finish-time import in the results pipeline.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg bg-[#1E3A5F]/30 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Publish (coming with import)
              </button>
            </div>
          </section>
        </>
      ) : null}
    </div>
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
function FullFinisherList({ comp, raceLabel }: { comp: ConsoleComputation; raceLabel: string }) {
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
          <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Full finisher list</h2>
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
                    {e.firstName} {e.lastName}
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
    return { name, start, end };
  });

  return (
    <div className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#1E3A5F]/55">
        Field timeline — division bands
      </p>
      <svg viewBox="0 0 800 84" className="mt-2 w-full" role="img" aria-label="Division bands across finish times">
        {bands.map((b) => {
          const c = DIVISION_COLORS[b.name] ?? DIVISION_COLORS.Echo;
          return (
            <g key={b.name}>
              <rect
                x={x(b.start)}
                y={18}
                width={Math.max(x(Math.min(b.end, maxH)) - x(b.start), 2)}
                height={36}
                fill={c.base}
                opacity={0.22}
              />
              <line x1={x(b.start)} y1={14} x2={x(b.start)} y2={58} stroke={c.dark} strokeWidth={1.5} />
              <text x={x(b.start) + 4} y={12} fontSize={10} fill="#1E3A5F" opacity={0.75}>
                {b.name} · {fmtHours(b.start)}
              </text>
            </g>
          );
        })}
        {comp.entries.map((e, i) => (
          <circle
            key={e.id}
            cx={x(e.timeH())}
            cy={36 + ((i * 7919) % 13) - 6}
            r={2.2}
            fill={e.payout > 0 ? "#E87722" : "#1E3A5F"}
            opacity={e.payout > 0 ? 0.95 : 0.45}
          />
        ))}
        <line x1={24} y1={62} x2={776} y2={62} stroke="#1E3A5F" strokeWidth={1} opacity={0.3} />
        <text x={24} y={78} fontSize={10} fill="#1E3A5F" opacity={0.6}>
          {fmtHours(minH)}
        </text>
        <text x={776} y={78} fontSize={10} fill="#1E3A5F" opacity={0.6} textAnchor="end">
          {fmtHours(maxH)}
        </text>
      </svg>
      <p className="mt-1 text-xs text-[#1E3A5F]/55">
        Each dot is a finisher; orange dots are in the money. Band lines are the algorithm&apos;s division boundaries.
      </p>
    </div>
  );
}
