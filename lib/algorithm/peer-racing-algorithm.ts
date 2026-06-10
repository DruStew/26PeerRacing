/**
 * Port of run() / set_entry_divisions() from 26_PR Program/src/peer_racing_algorithm.py.
 *
 * Pipeline (numbering matches the Python comments):
 *  1. raw stats in hours + percentile bounds for the division range
 *  2. natural log of all times (seconds)
 *  3. scale the log-average to 100
 *  4. build an adjusted sigmoid and sample it to pick division boundaries
 *  5. map boundaries back to hours
 *  6. walk the sorted field assigning divisions, places, and payouts
 *
 * Matplotlib plotting is replaced by returned chart data (`diagnostics`) so the web UI
 * can render the same analysis views; none of it feeds the division math.
 */

import type { AlgorithmEntry } from "./entry";
import { normPdf, npLinspace, npMax, npMean, npMin, npPercentile, npStd } from "./numeric";

const DIVISION_LABELS = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] as const;

/**
 * Where division counts and per-place amounts come from. The parity harness passes the
 * ported RaceFinances; the web app passes an adapter over the producer's saved payout
 * settings (lib/payout) so money is defined in exactly one place.
 */
export interface PayoutSource {
  numDivisions(incentiveRun?: number | null): number;
  payout(incentiveRun?: number | null): Record<string, number[]>;
}

export interface AlgorithmDivisionsConfig {
  /** Percentile bounds for the division range ("tweak the ends" controls). */
  max_percentile: number;
  min_percentile: number;
}

export interface AlgorithmDiagnostics {
  /** Raw-time PDF points (x in hours, y = normal pdf). */
  pointsRaw: { x: number[]; y: number[] };
  /** Log-normalized PDF points. */
  pointsNormed: { x: number[]; y: number[] };
  /** Adjusted sigmoid samples used to visualize division selection. */
  pointsDivisions: { x: number[]; y: number[] };
  /** ±2 standard deviation lines, in hours. */
  stdLinesH: number[];
  /** Percentile cutoff lines, in hours. */
  percentilesH: number[];
  /** Log scale factor (mean(ln seconds) / 100). */
  scaleFactor: number;
  rawStatsH: { avg: number; std: number; min: number; max: number };
}

export interface AlgorithmRunResult {
  /** Division label -> entries in that division, in finish order (mutated in place). */
  winners: Map<string, AlgorithmEntry[]>;
  /** Division lower bounds in hours; first element is the fastest finisher's time. */
  divisionsH: number[];
  diagnostics: AlgorithmDiagnostics;
}

function createDivisionFunc(
  max: number,
  min: number,
  std: number,
  avg: number,
  stretchFactor = 1.0,
): (x: number) => number {
  const c1 = (max - min) / (4 * std);
  const c2 = Math.log((max - avg) / (avg - min)) / c1;
  return (x: number) => (max - min) / (1 + Math.exp(-(stretchFactor * c1) * (x - c2))) + min;
}

/**
 * set_entry_divisions — walk sorted entries assigning division + 1-based place, then
 * overwrite the paid places' rank ("Alpha 3") and set payouts from the finance structure.
 */
function setEntryDivisions(
  entries: AlgorithmEntry[],
  divisionsH: number[],
  raceFinances: PayoutSource,
  incentiveRun: number | null,
): Map<string, AlgorithmEntry[]> {
  const winners = new Map<string, AlgorithmEntry[]>();
  const dl = (i: number) => DIVISION_LABELS[i];

  const divisionsList = [...divisionsH, Number.MAX_VALUE];
  let cd = divisionsList.shift()!;
  let nd = divisionsList.shift()!;
  let i = 0;
  winners.set(dl(i), []);

  for (const e of entries) {
    if (e.timeH() >= nd) {
      cd = nd;
      nd = divisionsList.shift()!;
      i += 1;
      winners.set(dl(i), []);
    }
    if (e.timeH() >= cd) {
      const bucket = winners.get(dl(i))!;
      e.setDivision(dl(i), bucket.length + 1);
      bucket.push(e);
    }
  }

  const payoutStructure = raceFinances.payout(incentiveRun);
  for (const [division, runners] of winners) {
    const payouts = payoutStructure[division];
    if (!payouts) continue; // Python logs a warning for divisions without payouts
    for (let p = 0; p < payouts.length; p++) {
      if (p >= runners.length) break;
      runners[p].peerRacingRank = `${division} ${p + 1}`;
      if (incentiveRun === null) runners[p].payout = payouts[p];
      else runners[p].setIncentivePayout(incentiveRun, payouts[p]);
    }
  }

  return winners;
}

/**
 * Port of peer_racing_algorithm.run(). `entries` must already be sorted by time
 * (state.sort_entries). Entries are mutated: division/place rank and payout fields.
 */
export function runAlgorithm(
  entries: AlgorithmEntry[],
  divisionsConfig: AlgorithmDivisionsConfig,
  raceFinances: PayoutSource,
  incentiveRun: number | null = null,
): AlgorithmRunResult {
  const numDivisions = raceFinances.numDivisions(incentiveRun);

  const timesS = entries.map((e) => e.timeS);

  // 1. raw stats in hours + percentile bounds
  const timesH = timesS.map((t) => t / 3600.0);
  const rawStatsH = {
    avg: npMean(timesH),
    std: npStd(timesH),
    min: npMin(timesH),
    max: npMax(timesH),
  };
  const pointsRaw = {
    x: timesH,
    y: timesH.map((t) => normPdf(t, rawStatsH.avg, rawStatsH.std)),
  };
  const divBoundsMaxH = npPercentile(timesH, divisionsConfig.max_percentile);
  const divBoundsMinH = npPercentile(timesH, divisionsConfig.min_percentile);

  // 2. natural log of all times (in seconds)
  const timesLog = timesS.map((t) => Math.log(t));

  // 3. scale the log-average to 100
  const sf = npMean(timesLog) / 100.0;
  const timesLogScaled = timesLog.map((t) => t / sf);
  const normStats = {
    avg: npMean(timesLogScaled),
    std: npStd(timesLogScaled),
    min: npMin(timesLogScaled),
    max: npMax(timesLogScaled),
  };
  const pointsNormed = {
    x: timesLogScaled,
    y: timesLogScaled.map((t) => normPdf(t, normStats.avg, normStats.std)),
  };

  const h2logScaled = (h: number) => Math.log(h * 3600.0) / sf;
  const ivf = (v: number) => Math.exp(v * sf) / 3600.0;

  // 4. build the adjusted sigmoid and sample division boundaries
  const divCnt = numDivisions - 1;
  const divFunc = createDivisionFunc(
    h2logScaled(divBoundsMaxH),
    h2logScaled(divBoundsMinH),
    normStats.std,
    normStats.avg,
  );
  const divInputs = npLinspace(-divCnt / 2.0, divCnt / 2.0, divCnt);
  const divisions = divInputs.map((x) => divFunc(x));

  const samps = npLinspace(-divCnt / 2.0 - 3, divCnt / 2.0 + 3, 100);
  const pointsDivisions = { x: samps, y: samps.map((x) => divFunc(x)) };

  // 5. map boundaries back to hours
  const divisionsH = [rawStatsH.min, ...divisions.map(ivf)];
  const stdLinesH: number[] = [];
  for (let k = -2; k <= 2; k++) stdLinesH.push(k * rawStatsH.std + rawStatsH.avg);
  const percentilesH = [divBoundsMinH, divBoundsMaxH];

  // 6. assign divisions, places, and payouts
  const winners = setEntryDivisions(entries, divisionsH, raceFinances, incentiveRun);

  return {
    winners,
    divisionsH,
    diagnostics: {
      pointsRaw,
      pointsNormed,
      pointsDivisions,
      stdLinesH,
      percentilesH,
      scaleFactor: sf,
      rawStatsH,
    },
  };
}

/**
 * Incentive subset filters from app.run_algorithm: female, military, or age
 * ["over"|"under", <years>]. Returns the subset (original order preserved).
 */
export function filterIncentiveEntries(
  entries: AlgorithmEntry[],
  criteria: string | (string | number)[],
): AlgorithmEntry[] {
  if (criteria === "female") return entries.filter((e) => e.isFemale());
  if (criteria === "military") return entries.filter((e) => e.isMilitary());
  if (Array.isArray(criteria) && (criteria[0] === "over" || criteria[0] === "under")) {
    const limit = parseInt(String(criteria[1]), 10);
    return criteria[0] === "over"
      ? entries.filter((e) => e.age >= limit)
      : entries.filter((e) => e.age <= limit);
  }
  return [];
}
