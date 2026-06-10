/**
 * Port of 26_PR Program/src/master_calculator.py — payout spread tables, auto
 * division/slot sizing, incentive divisions, and the RaceFinances breakdown.
 * All dollar math stays in floats with CPython round() (banker's) like the original.
 */

import { pythonRound } from "./numeric";

export const PAYOUT_SPREAD_LOOKUP: Record<number, number[]> = {
  1: [1.0],
  2: [0.6, 0.4],
  3: [0.5, 0.3, 0.2],
  4: [0.4, 0.3, 0.2, 0.1],
  5: [0.35, 0.25, 0.19, 0.14, 0.07],
  6: [0.33, 0.23, 0.17, 0.12, 0.09, 0.06],
  7: [0.3, 0.21, 0.16, 0.12, 0.09, 0.07, 0.05],
  8: [0.28, 0.19, 0.15, 0.11, 0.09, 0.08, 0.06, 0.04],
  9: [0.26, 0.18, 0.14, 0.11, 0.09, 0.07, 0.06, 0.05, 0.04],
  10: [0.24, 0.18, 0.13, 0.11, 0.09, 0.07, 0.06, 0.05, 0.04, 0.03],
  11: [0.23, 0.17, 0.12, 0.1, 0.09, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03],
  12: [0.22, 0.17, 0.12, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.04, 0.03, 0.03],
};

export const DIVISION_NAMES: Record<number, string> = {
  0: "Alpha",
  1: "Bravo",
  2: "Charlie",
  3: "Delta",
  4: "Echo",
};

/** calclulate_num_payout_slots (sic) — paid places scale with field size. */
export function calculateNumPayoutSlots(totalRunners: number): number {
  if (totalRunners < 1) throw new Error("total_runners must be >= 1");
  if (totalRunners <= 10) return 1;
  if (totalRunners <= 20) return 2;
  if (totalRunners <= 40) return 3;
  if (totalRunners <= 60) return 4;
  if (totalRunners <= 90) return 5;
  if (totalRunners <= 120) return 6;
  if (totalRunners <= 150) return 7;
  if (totalRunners <= 180) return 8;
  if (totalRunners <= 210) return 9;
  if (totalRunners <= 240) return 10;
  if (totalRunners <= 270) return 11;
  return 12;
}

/** calclulate_num_divisions (sic) — division count scales with field size, capped at 5. */
export function calculateNumDivisions(totalRunners: number): number {
  if (totalRunners < 1) throw new Error("total_runners must be >= 1");
  if (totalRunners <= 5) return 1;
  if (totalRunners <= 10) return 2;
  if (totalRunners <= 15) return 3;
  if (totalRunners <= 24) return 4;
  return 5;
}

export type IncentiveDivisionType = "off" | "percentage" | "fixed";

/** "female" | "military" | ["over", "50"] | ["under", "40"] — as in the program's config. */
export type IncentiveCriteria = string | (string | number)[];

export interface IncentiveDivisionConfig {
  type: IncentiveDivisionType;
  value: number;
  payout_slots: number;
  divisions: number;
  criteria: IncentiveCriteria;
}

export class IncentiveDivision {
  readonly divType: IncentiveDivisionType;
  readonly value: number;
  readonly divisions: number;
  readonly payoutSlots: number;
  readonly criteria: IncentiveCriteria;
  readonly totalPayout: number;
  readonly divisionPayout: number;
  readonly payoutStructure: Record<string, number[]>;

  constructor(config: IncentiveDivisionConfig, grossEntryFees: number) {
    this.divType = config.type;
    this.value = config.value;
    this.divisions = config.divisions;
    this.payoutSlots = config.payout_slots;
    this.criteria = config.criteria;

    if (this.divType === "off") {
      this.totalPayout = 0;
    } else if (this.divType === "percentage") {
      if (this.value > 100 || this.value < 0) throw new Error("percentage value out of range");
      // Calculated from gross entry fees, not net (matches Python).
      this.totalPayout = (this.value / 100) * grossEntryFees;
    } else if (this.divType === "fixed") {
      this.totalPayout = this.value;
    } else {
      throw new Error(`invalid incentive division type ${this.divType}`);
    }

    if (this.payoutSlots < 0 || this.payoutSlots > 5) throw new Error("payout_slots out of range");
    if (this.divisions < 0 || this.divisions > 5) throw new Error("divisions out of range");

    this.payoutStructure = {};
    this.divisionPayout = this.totalPayout / this.divisions;
    for (let div = 0; div < this.divisions; div++) {
      this.payoutStructure[DIVISION_NAMES[div]] = PAYOUT_SPREAD_LOOKUP[this.payoutSlots].map(
        (pct) => pythonRound(this.divisionPayout * pct),
      );
    }
  }

  name(): string {
    if (Array.isArray(this.criteria)) return this.criteria.map((c) => String(c)).join("");
    return this.criteria;
  }

  payout(): number {
    return this.totalPayout;
  }

  payoutPerDivision(div: string | number): number {
    const key = typeof div === "number" ? DIVISION_NAMES[div] : div;
    return this.payoutStructure[key].reduce((a, b) => a + b, 0);
  }
}

export interface RaceFinancesInput {
  entryFee: number;
  totalRunners: number;
  processingFeePct: number;
  prHoldingPct: number;
  promoterSplitPct: number;
  addedMoney: number;
  d1Adjustment: number;
  incentiveDivision1?: IncentiveDivisionConfig | null;
  incentiveDivision2?: IncentiveDivisionConfig | null;
  incentiveDivision3?: IncentiveDivisionConfig | null;
  payoutSlots: number;
  divisions: number;
}

/** Port of RaceFinances — same computation order so float rounding matches. */
export class RaceFinances {
  readonly totalRunners: number;
  readonly d1Adjustment: number;
  readonly payoutSlots: number;
  readonly entryFee: number;
  readonly processingFeePct: number;
  readonly prHoldingPct: number;
  readonly promoterSplitPct: number;
  readonly addedMoney: number;

  readonly grossEntryFees: number;
  readonly totalProcessingFees: number;
  readonly netEntryFees: number;
  readonly prHolding: number;
  readonly promoterProfit: number;
  readonly prProfit: number;
  readonly totalPurse: number;

  readonly incentiveDivisions: IncentiveDivision[];
  readonly incentiveDivisionPurse: number;
  readonly finalRacersPurse: number;
  readonly payoutStructure: Record<string, number[]>;
  readonly totalPayout: number;

  private readonly divisionsCount: number;

  constructor(input: RaceFinancesInput) {
    this.divisionsCount = input.divisions;
    this.totalRunners = input.totalRunners;
    this.d1Adjustment = input.d1Adjustment;
    this.payoutSlots = input.payoutSlots;
    this.entryFee = input.entryFee;
    this.processingFeePct = input.processingFeePct;
    this.prHoldingPct = input.prHoldingPct;
    this.promoterSplitPct = input.promoterSplitPct;
    this.addedMoney = input.addedMoney;

    this.grossEntryFees = this.entryFee * this.totalRunners;
    this.totalProcessingFees = this.grossEntryFees * (this.processingFeePct / 100);
    this.netEntryFees = this.grossEntryFees - this.totalProcessingFees;
    this.prHolding = this.netEntryFees * (this.prHoldingPct / 100);
    this.promoterProfit = this.prHolding * (this.promoterSplitPct / 100);
    this.prProfit = this.prHolding - this.promoterProfit;
    const racersPurseInitial = this.netEntryFees - this.prHolding;
    this.totalPurse = racersPurseInitial + this.addedMoney;

    this.incentiveDivisions = [];
    for (const div of [input.incentiveDivision1, input.incentiveDivision2, input.incentiveDivision3]) {
      if (div == null) continue;
      if (div.type === "off") continue;
      this.incentiveDivisions.push(new IncentiveDivision(div, this.grossEntryFees));
    }

    this.incentiveDivisionPurse = 0;
    for (const ic of this.incentiveDivisions) {
      this.incentiveDivisionPurse += ic.payout();
    }

    this.finalRacersPurse = this.totalPurse - this.incentiveDivisionPurse - this.d1Adjustment;

    this.payoutStructure = {};
    for (let div = 0; div < this.divisionsCount; div++) {
      const divisionPayout =
        div === 0
          ? this.finalRacersPurse / this.divisionsCount + this.d1Adjustment
          : this.finalRacersPurse / this.divisionsCount;
      this.payoutStructure[DIVISION_NAMES[div]] = PAYOUT_SPREAD_LOOKUP[this.payoutSlots].map(
        (pct) => pythonRound(divisionPayout * pct),
      );
    }

    this.totalPayout = 0;
    for (const payouts of Object.values(this.payoutStructure)) {
      for (const p of payouts) this.totalPayout += p;
    }
    for (const ic of this.incentiveDivisions) {
      this.totalPayout += ic.payout();
    }
  }

  numDivisions(incentiveRun: number | null = null): number {
    if (incentiveRun === null) return this.divisionsCount;
    return this.incentiveDivisions[incentiveRun].divisions;
  }

  payout(incentiveRun: number | null = null): Record<string, number[]> {
    if (incentiveRun === null) return this.payoutStructure;
    return this.incentiveDivisions[incentiveRun].payoutStructure;
  }
}
