/**
 * Peer Racing producer payout model — mirrors the Master Calculator / Payout Schedule workbook.
 * Percentages in the schedule are fixed; producer-controlled inputs are all other fields.
 */

/** Column keys from the Payout Schedule tab (entrant-count brackets). */
export type PayoutBracketId =
  | "<10"
  | "11 to 20"
  | "21-40"
  | "41-60"
  | "61-90"
  | "91-120"
  | "121-150"
  | "151-180"
  | "181-210"
  | "211-240"
  | "241-270"
  | "271-300";

export type PayoutCalculationInput = {
  /** Entry-based uses the normal percentage waterfall; guaranteed fixes the complete cash purse. */
  cashPayoutMode?: "entry_based" | "guaranteed";
  /** Fixed total cash purse in guaranteed mode; incentives come off the top. */
  guaranteedCashPayoutCents?: number;
  /** Paid entries counted toward the pot (manual or from reporting later). */
  entryCount: number;
  /** Weighted-average or primary distance entry fee in cents. */
  entryFeeCents: number;
  /** Optional field size used only to select the payout schedule column. */
  scheduleBracketEntryCount?: number;
  /** Processing / platform fee as a fraction of gross (e.g. 0.04 = 4%). */
  processingFeeFraction: number;
  /**
   * Series shootout fund holding, as a fraction of net-after-processing.
   * Taken BEFORE PR holding; banked per distance to fund the series finale.
   */
  shootoutFraction?: number;
  /** Fraction of net-after-processing (less shootout fund) that goes to PR “holding” (remainder → racers pot). */
  prHoldingFraction: number;
  /** Of the PR holding slice, fraction paid to the producer (remainder → Peer Racing org). */
  producerFractionOfPrHolding: number;
  /** True added money: sponsor / external dollars added to the contestant pool (not from entry fees). */
  trueAddedMoneyCents: number;
  /** Incentive dollars for female payoffs; taken from racers pot (before true added). */
  femaleIncentiveFromRacersPotCents: number;
  /** Incentive dollars for military payoffs; taken from racers pot (before true added). */
  militaryIncentiveFromRacersPotCents: number;
  /** Peer Team divisions (1–5) for splitting the female incentive pool; same schedule as main race. */
  femaleIncentiveDivisionCount: number;
  femaleIncentivePlacesToPay: number;
  femaleIncentiveDivisionLabels?: string[];
  /** Auto: column from `femaleIncentiveBracketEntryCount`; manual: use `femaleIncentiveManualBracket`. */
  femaleIncentiveScheduleMode: "auto" | "manual";
  femaleIncentiveManualBracket?: PayoutBracketId;
  /** Entries for this distance with female profile (drives auto schedule band). */
  femaleIncentiveBracketEntryCount: number;
  /** Peer Team divisions (1–5) for splitting the military incentive pool. */
  militaryIncentiveDivisionCount: number;
  militaryIncentivePlacesToPay: number;
  militaryIncentiveDivisionLabels?: string[];
  militaryIncentiveScheduleMode: "auto" | "manual";
  militaryIncentiveManualBracket?: PayoutBracketId;
  /** Entries for this distance with military profile (drives auto schedule band). */
  militaryIncentiveBracketEntryCount: number;
  /**
   * Dollars carved from the contestant pool and stacked onto the elite division’s base
   * (spreadsheet “D1 Added $”) before the even per-division split of the remainder.
   */
  eliteDivisionCarveFromPoolCents: number;
  /** Number of paid divisions (e.g. 5 = Alpha … Echo). */
  divisionCount: number;
  /** 0-based index of the division that receives the elite carve (default 0 = first). */
  eliteDivisionIndex: number;
  /** Use automatic bracket from `entryCount`, or force a column from the schedule. */
  scheduleMode: "auto" | "manual";
  manualBracket?: PayoutBracketId;
  /**
   * How many finishing positions receive money per division. Schedule weights for places 1..N
   * are taken as fixed; amounts are renormalized across those holes so each division pool is fully allocated.
   */
  placesToPay: number;
  /** Optional labels for reporting (Division 1 …). */
  divisionLabels?: string[];
};

export type PlacePayoutLine = {
  place: number;
  /** Fixed schedule weight before renormalization (0 if unused). */
  scheduleWeight: number;
  /** Share of division pool after renormalizing across `placesToPay` holes. */
  normalizedFraction: number;
  amountCents: number;
};

export type DivisionPayoutResult = {
  index: number;
  label: string;
  /** Total pool for this division before place splits. */
  poolCents: number;
  places: PlacePayoutLine[];
  placesPaidTotalCents: number;
};

export type PayoutCalculationResult = {
  cashPayoutMode: "entry_based" | "guaranteed";
  guaranteedCashPayoutCents: number;
  companyFundedCashShortfallCents: number;
  bracketUsed: PayoutBracketId;
  grossPotCents: number;
  processingFeeCents: number;
  netAfterProcessingCents: number;
  /** Dollars held back for the series shootout fund (off net-after-processing, before PR holding). */
  shootoutFundCents: number;
  prHoldingCents: number;
  /** Net to racers after PR holding (before female/military incentives). */
  racersPotCents: number;
  /** Female incentive dollars the producer planned (from input). */
  femaleIncentiveRequestedCents: number;
  /** Military incentive dollars the producer planned (from input). */
  militaryIncentiveRequestedCents: number;
  /**
   * Female incentive actually funded from the racers pot for schedule splits (min of requested vs available).
   */
  femaleIncentiveCents: number;
  /**
   * Military incentive actually funded from the racers pot for schedule splits (min of requested vs available).
   */
  militaryIncentiveCents: number;
  /**
   * Ledger: racers pot − planned female − planned military + true added. May be negative if planned payouts exceed pot.
   */
  contestantPoolLedgerCents: number;
  /** True added money included in the ledger line above (echo of input for display). */
  trueAddedMoneyCents: number;
  /** Elite carve requested (from input). */
  eliteCarveRequestedCents: number;
  /**
   * Ledger: contestant pool (planned) minus full planned elite carve. May be negative.
   */
  poolAfterCarveLedgerCents: number;
  /**
   * Funded contestant pool after allocated incentives + true added (non-negative); basis before carve for splits.
   */
  contestantPoolCents: number;
  /** Pool after effective carve; non-negative basis for main division place payouts. */
  poolAfterCarveCents: number;
  evenSharePerDivisionCents: number;
  eliteDivisionCarveCents: number;
  producerCents: number;
  peerRacingOrgCents: number;
  divisions: DivisionPayoutResult[];
  /** Sum of all place payouts across divisions — should equal funded contestant pool when math ties out. */
  totalContestantPayoutsCents: number;
  /** Female incentive pool split across divisions/holes (empty if no female pool). */
  femaleIncentiveDivisions: DivisionPayoutResult[];
  /** Military incentive pool split across divisions/holes (empty if no military pool). */
  militaryIncentiveDivisions: DivisionPayoutResult[];
  /** Schedule column used for female incentive splits (when pool &gt; 0). */
  femaleIncentiveBracketUsed: PayoutBracketId | null;
  /** Schedule column used for military incentive splits (when pool &gt; 0). */
  militaryIncentiveBracketUsed: PayoutBracketId | null;
  warnings: string[];
};

/** Saved producer payout inputs for one distance (race). */
export type DistancePayoutSettingsRow = {
  distance_id: string;
  /** False for prize-only races; divisions still run but no cash reaches racer wallets. */
  cash_payouts_enabled: boolean;
  cash_payout_mode: "entry_based" | "guaranteed";
  guaranteed_cash_payout_cents: number;
  marketing_entry_count: number | null;
  marketing_entry_fee_cents: number | null;
  marketing_female_entry_count: number | null;
  marketing_military_entry_count: number | null;
  processing_fee_fraction: number;
  shootout_fraction: number;
  pr_holding_fraction: number;
  producer_fraction_of_pr_holding: number;
  true_added_money_cents: number;
  female_incentive_cents: number;
  military_incentive_cents: number;
  female_incentive_division_count: number;
  female_incentive_places_to_pay: number;
  military_incentive_division_count: number;
  military_incentive_places_to_pay: number;
  female_incentive_schedule_mode: "auto" | "manual";
  female_incentive_manual_bracket: PayoutBracketId | null;
  military_incentive_schedule_mode: "auto" | "manual";
  military_incentive_manual_bracket: PayoutBracketId | null;
  elite_division_carve_cents: number;
  division_count: number;
  elite_division_index: number;
  schedule_mode: "auto" | "manual";
  manual_bracket: PayoutBracketId | null;
  places_to_pay: number;
  division_labels: string[] | null;
  entry_count_override: number | null;
  entry_fee_cents_override: number | null;
  updated_at: string;
};

/** @deprecated Use DistancePayoutSettingsRow */
export type EventPayoutSettingsRow = DistancePayoutSettingsRow;
