// Parity runner: executes the TypeScript port (lib/algorithm) against the same
// field.csv + config.json as driver.py and writes ts-output.json in the same shape.
// Usage: npx tsx scripts/algorithm-parity/run-ts.ts

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AlgorithmEntry,
  RaceFinances,
  calculateNumDivisions,
  calculateNumPayoutSlots,
  filterIncentiveEntries,
  parseRow,
  runAlgorithm,
  runPreAlgorithm,
  sortEntries,
} from "../../lib/algorithm";
import type { IncentiveDivisionConfig } from "../../lib/algorithm";

const here = dirname(fileURLToPath(import.meta.url));

interface ParityConfig {
  entry_fee: number;
  processing_fee_pct: number;
  pr_holding_pct: number;
  promoter_split_pct: number;
  added_money: number;
  d1_adjustment: number;
  divisions: {
    max_percentile: number;
    min_percentile: number;
    auto_set_divisions: boolean;
    divisions: number;
    payout_slots: number;
  };
  incentive_division1: IncentiveDivisionConfig;
  incentive_division2: IncentiveDivisionConfig;
  incentive_division3: IncentiveDivisionConfig;
  indices: Record<string, number>;
}

const config = JSON.parse(readFileSync(join(here, "config.json"), "utf8")) as ParityConfig;
const csvText = readFileSync(join(here, "field.csv"), "utf8");

const indices = {
  id: config.indices.id,
  bib: config.indices.bib,
  first: config.indices.first,
  last: config.indices.last,
  age: config.indices.age,
  sex: config.indices.sex,
  time: config.indices.time,
  military: config.indices.military,
};

const entries: AlgorithmEntry[] = [];
for (const line of csvText.split(/\r?\n/)) {
  if (!line.trim()) continue;
  const e = parseRow(line.split(","), indices);
  if (e) entries.push(e);
}
sortEntries(entries);

const total = entries.length;
const auto = config.divisions.auto_set_divisions;
const payoutSlots = auto ? calculateNumPayoutSlots(total) : config.divisions.payout_slots;
const divisions = auto ? calculateNumDivisions(total) : config.divisions.divisions;

const rf = new RaceFinances({
  entryFee: config.entry_fee,
  totalRunners: total,
  processingFeePct: config.processing_fee_pct,
  prHoldingPct: config.pr_holding_pct,
  promoterSplitPct: config.promoter_split_pct,
  addedMoney: config.added_money,
  d1Adjustment: config.d1_adjustment,
  incentiveDivision1: config.incentive_division1,
  incentiveDivision2: config.incentive_division2,
  incentiveDivision3: config.incentive_division3,
  payoutSlots,
  divisions,
});

function serializeWinners(winners: Map<string, AlgorithmEntry[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [div, runners] of winners) out[div] = runners.map((e) => e.id);
  return out;
}

const mainRun = runAlgorithm(entries, config.divisions, rf);

const incentiveRuns = rf.incentiveDivisions.map((ic, i) => {
  const subset = filterIncentiveEntries(entries, ic.criteria);
  const result = runAlgorithm(subset, config.divisions, rf, i);
  return {
    criteria: ic.name(),
    subsetIds: subset.map((e) => e.id),
    divisionsH: result.divisionsH,
    winners: serializeWinners(result.winners),
  };
});

const preAlg = runPreAlgorithm(entries);

const out = {
  totals: { runners: total, payoutSlots, divisions },
  finances: {
    grossEntryFees: rf.grossEntryFees,
    totalProcessingFees: rf.totalProcessingFees,
    netEntryFees: rf.netEntryFees,
    prHolding: rf.prHolding,
    promoterProfit: rf.promoterProfit,
    prProfit: rf.prProfit,
    totalPurse: rf.totalPurse,
    incentiveDivisionPurse: rf.incentiveDivisionPurse,
    finalRacersPurse: rf.finalRacersPurse,
    payoutStructure: rf.payoutStructure,
    totalPayout: rf.totalPayout,
    incentives: rf.incentiveDivisions.map((ic) => ({
      name: ic.name(),
      totalPayout: ic.totalPayout,
      payoutStructure: ic.payoutStructure,
    })),
  },
  preAlgorithm: {
    lowPercentileCutoff: preAlg.lowPercentileCutoff,
    highPercentileCutoff: preAlg.highPercentileCutoff,
  },
  main: { divisionsH: mainRun.divisionsH, winners: serializeWinners(mainRun.winners) },
  incentiveRuns,
  entries: entries.map((e) => ({
    id: e.id,
    timeS: e.timeS,
    overallRank: e.overallRank,
    peerRacingRank: e.peerRacingRank,
    payout: e.payout,
    incentivePayout1: e.incentivePayout1,
    incentivePayout2: e.incentivePayout2,
    incentivePayout3: e.incentivePayout3,
    sex: e.sex,
    age: e.age,
    military: e.isMilitary(),
  })),
};

const outPath = join(here, "ts-output.json");
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`wrote ${outPath} (${total} entries)`);
