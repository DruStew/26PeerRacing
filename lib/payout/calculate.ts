import { entryCountToBracket } from "./bracket";
import { PAYOUT_SCHEDULE } from "./schedule";
import type {
  DivisionPayoutResult,
  PayoutBracketId,
  PayoutCalculationInput,
  PayoutCalculationResult,
  PlacePayoutLine,
} from "./types";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function resolveIncentiveScheduleColumn(
  mode: "auto" | "manual" | undefined,
  manual: PayoutBracketId | undefined,
  bandEntryCount: number,
): PayoutBracketId {
  if (mode === "manual" && manual) return manual;
  return entryCountToBracket(Math.max(0, bandEntryCount));
}

/** Distribute integer cents across positive weights (largest-remainder). */
export function distributeCentsByWeights(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || totalCents <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (totalCents * w) / sum);
  const floors = exact.map((x) => Math.floor(x));
  const remainder = totalCents - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < remainder; k++) {
    out[order[k].i]++;
  }
  return out;
}

function defaultDivisionLabel(i: number, custom?: string[]) {
  const d = custom?.[i]?.trim();
  if (d) return d;
  const names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel"];
  return names[i] ?? `Division ${i + 1}`;
}

/**
 * Split a single incentive pool across Peer Team divisions using the same schedule column as the main race
 * (even split of the pool, then place weights per division). No elite carve.
 */
function splitIncentivePoolAcrossDivisions(
  poolCents: number,
  divisionCount: number,
  placesToPay: number,
  bracketUsed: PayoutBracketId,
  divisionLabels?: string[],
): DivisionPayoutResult[] {
  const dCount = Math.min(5, Math.max(1, Math.floor(divisionCount)));
  const pPay = clamp(Math.floor(placesToPay), 1, 12);
  if (poolCents <= 0) return [];

  const column = PAYOUT_SCHEDULE[bracketUsed];
  const rawForPlaces = column.slice(0, pPay).map((w) => (w == null ? 0 : w));
  const weightSum = rawForPlaces.reduce((a, b) => a + b, 0);

  const evenSharePerDivisionCents = Math.floor(poolCents / dCount);
  const remainderFromSplit = poolCents - evenSharePerDivisionCents * dCount;

  const divisions: DivisionPayoutResult[] = [];

  for (let i = 0; i < dCount; i++) {
    let poolCentsDiv = evenSharePerDivisionCents;
    if (i === dCount - 1 && remainderFromSplit > 0) {
      poolCentsDiv += remainderFromSplit;
    }

    const weightRow = rawForPlaces.slice(0, pPay);
    const amounts =
      weightSum > 0
        ? distributeCentsByWeights(poolCentsDiv, weightRow)
        : new Array(pPay).fill(0);

    const places: PlacePayoutLine[] = [];
    for (let p = 0; p < pPay; p++) {
      const sw = column[p];
      const scheduleWeight = sw == null ? 0 : sw;
      const nf = weightSum > 0 && sw != null && sw > 0 ? sw / weightSum : 0;
      places.push({
        place: p + 1,
        scheduleWeight,
        normalizedFraction: nf,
        amountCents: amounts[p] ?? 0,
      });
    }

    const placesPaidTotalCents = places.reduce((s, x) => s + x.amountCents, 0);

    divisions.push({
      index: i,
      label: defaultDivisionLabel(i, divisionLabels),
      poolCents: poolCentsDiv,
      places,
      placesPaidTotalCents,
    });
  }

  return divisions;
}

/**
 * Compute full financial breakdown + per-division place payouts.
 */
export function calculateEventPayout(input: PayoutCalculationInput): PayoutCalculationResult {
  const warnings: string[] = [];
  const cashPayoutMode = input.cashPayoutMode === "guaranteed" ? "guaranteed" : "entry_based";
  const guaranteedCashPayoutCents =
    cashPayoutMode === "guaranteed" ? Math.max(0, Math.round(input.guaranteedCashPayoutCents ?? 0)) : 0;

  const processingFeeFraction = clamp(input.processingFeeFraction, 0, 1);
  const shootoutFraction = clamp(input.shootoutFraction ?? 0, 0, 1);
  const prHoldingFraction = clamp(input.prHoldingFraction, 0, 1);
  const producerFractionOfPrHolding = clamp(input.producerFractionOfPrHolding, 0, 1);
  const divisionCount = Math.min(5, Math.max(1, Math.floor(input.divisionCount)));
  const eliteIdx = clamp(Math.floor(input.eliteDivisionIndex), 0, divisionCount - 1);
  const placesToPay = clamp(Math.floor(input.placesToPay), 1, 12);

  const bracketUsed: PayoutBracketId =
    input.scheduleMode === "manual" && input.manualBracket
      ? input.manualBracket
      : entryCountToBracket(input.scheduleBracketEntryCount ?? input.entryCount);

  const grossPotCents = Math.max(0, Math.round(input.entryCount * input.entryFeeCents));
  const processingFeeCents = Math.round(grossPotCents * processingFeeFraction);
  const netAfterProcessingCents = grossPotCents - processingFeeCents;

  // Shootout fund skims net-after-processing FIRST; PR holding applies to the remainder.
  const shootoutFundCents = Math.round(netAfterProcessingCents * shootoutFraction);
  const netAfterShootoutCents = netAfterProcessingCents - shootoutFundCents;

  const reqFemale = Math.max(0, Math.round(input.femaleIncentiveFromRacersPotCents));
  const reqMilitary = Math.max(0, Math.round(input.militaryIncentiveFromRacersPotCents));
  let prHoldingCents: number;
  let racersPotCents: number;
  let femaleAlloc: number;
  let militaryAlloc: number;
  let trueAdded: number;
  let contestantPoolLedgerCents: number;
  let contestantPoolCents: number;
  let companyFundedCashShortfallCents = 0;

  if (cashPayoutMode === "guaranteed") {
    companyFundedCashShortfallCents = Math.max(0, guaranteedCashPayoutCents - netAfterShootoutCents);
    prHoldingCents = Math.max(0, netAfterShootoutCents - guaranteedCashPayoutCents);
    racersPotCents = Math.min(netAfterShootoutCents, guaranteedCashPayoutCents);
    femaleAlloc = Math.min(reqFemale, guaranteedCashPayoutCents);
    militaryAlloc = Math.min(reqMilitary, guaranteedCashPayoutCents - femaleAlloc);
    trueAdded = 0;
    contestantPoolLedgerCents = guaranteedCashPayoutCents - reqFemale - reqMilitary;
    contestantPoolCents = guaranteedCashPayoutCents - femaleAlloc - militaryAlloc;
    if (reqFemale + reqMilitary > guaranteedCashPayoutCents) {
      warnings.push(
        "Planned female + military incentives exceed the guaranteed cash purse — incentive payouts are clamped and nothing remains for main divisions.",
      );
    }
    if (companyFundedCashShortfallCents > 0) {
      warnings.push(
        `The guaranteed cash purse exceeds modeled net entry revenue by $${(companyFundedCashShortfallCents / 100).toFixed(2)} — the company funds the shortfall.`,
      );
    }
    if (input.trueAddedMoneyCents > 0) {
      warnings.push("True added money is ignored in guaranteed mode because the guarantee is the complete cash purse.");
    }
  } else {
    prHoldingCents = Math.round(netAfterShootoutCents * prHoldingFraction);
    racersPotCents = netAfterShootoutCents - prHoldingCents;
    /** Funded from racers pot for incentive splits (female first, then military). */
    femaleAlloc = Math.min(reqFemale, racersPotCents);
    militaryAlloc = Math.min(reqMilitary, racersPotCents - femaleAlloc);

    if (reqFemale + reqMilitary > racersPotCents) {
      warnings.push(
        "Planned female + military incentives exceed the current racers pot — splits use funded amounts only; the ledger shows the gap.",
      );
    }

    trueAdded = Math.max(0, Math.round(input.trueAddedMoneyCents));
    /** Ledger using planned incentive amounts (may be negative). */
    contestantPoolLedgerCents = racersPotCents - reqFemale - reqMilitary + trueAdded;
    /** Funded pool for main-race splits (non-negative). */
    contestantPoolCents = racersPotCents - femaleAlloc - militaryAlloc + trueAdded;
  }
  const femaleIncentiveCents = femaleAlloc;
  const militaryIncentiveCents = militaryAlloc;

  const carve = Math.max(0, Math.round(input.eliteDivisionCarveFromPoolCents));
  const poolAfterCarveLedgerCents = contestantPoolLedgerCents - carve;
  if (carve > contestantPoolCents) {
    warnings.push(
      "Planned elite carve exceeds the funded contestant pool — carve is clamped for division payouts; the ledger shows the gap.",
    );
  }
  const effectiveCarve = Math.min(carve, contestantPoolCents);
  const poolAfterCarveCents = contestantPoolCents - effectiveCarve;

  if (divisionCount <= 0) {
    warnings.push("At least one division is required.");
  }

  const evenSharePerDivisionCents =
    divisionCount > 0 ? Math.floor(poolAfterCarveCents / divisionCount) : 0;
  const remainderFromSplit = poolAfterCarveCents - evenSharePerDivisionCents * divisionCount;

  const producerCents = Math.round(prHoldingCents * producerFractionOfPrHolding);
  const peerRacingOrgCents = prHoldingCents - producerCents;

  const column = PAYOUT_SCHEDULE[bracketUsed];
  const rawForPlaces = column.slice(0, placesToPay).map((w) => (w == null ? 0 : w));
  const weightSum = rawForPlaces.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) {
    warnings.push("No positive payout weights for this bracket and places-to-pay — check schedule.");
  }

  const divisions: DivisionPayoutResult[] = [];
  let totalContestantPayoutsCents = 0;

  for (let i = 0; i < divisionCount; i++) {
    let poolCents = evenSharePerDivisionCents;
    if (i === eliteIdx) {
      poolCents += effectiveCarve;
    }
    if (i === divisionCount - 1 && remainderFromSplit > 0) {
      poolCents += remainderFromSplit;
    }

    const weightRow = rawForPlaces.slice(0, placesToPay);
    const amounts =
      weightSum > 0
        ? distributeCentsByWeights(poolCents, weightRow)
        : new Array(placesToPay).fill(0);

    const places: PlacePayoutLine[] = [];
    for (let p = 0; p < placesToPay; p++) {
      const sw = column[p];
      const scheduleWeight = sw == null ? 0 : sw;
      const nf = weightSum > 0 && sw != null && sw > 0 ? sw / weightSum : 0;
      places.push({
        place: p + 1,
        scheduleWeight,
        normalizedFraction: nf,
        amountCents: amounts[p] ?? 0,
      });
    }

    const placesPaidTotalCents = places.reduce((s, x) => s + x.amountCents, 0);
    totalContestantPayoutsCents += placesPaidTotalCents;

    divisions.push({
      index: i,
      label: defaultDivisionLabel(i, input.divisionLabels),
      poolCents,
      places,
      placesPaidTotalCents,
    });
  }

  if (Math.abs(totalContestantPayoutsCents - contestantPoolCents) > divisionCount + 2) {
    warnings.push(
      "Rounding: total place payouts may differ from contestant pool by a few cents across divisions.",
    );
  }

  const femDivN = Math.min(5, Math.max(1, Math.floor(input.femaleIncentiveDivisionCount ?? 1)));
  const femPlaces = clamp(Math.floor(input.femaleIncentivePlacesToPay ?? 12), 1, 12);
  const milDivN = Math.min(5, Math.max(1, Math.floor(input.militaryIncentiveDivisionCount ?? 1)));
  const milPlaces = clamp(Math.floor(input.militaryIncentivePlacesToPay ?? 12), 1, 12);

  const femaleIncentiveBracketUsed: PayoutBracketId | null =
    reqFemale > 0
      ? resolveIncentiveScheduleColumn(
          input.femaleIncentiveScheduleMode ?? "auto",
          input.femaleIncentiveManualBracket,
          input.femaleIncentiveBracketEntryCount ?? 0,
        )
      : null;

  const militaryIncentiveBracketUsed: PayoutBracketId | null =
    reqMilitary > 0
      ? resolveIncentiveScheduleColumn(
          input.militaryIncentiveScheduleMode ?? "auto",
          input.militaryIncentiveManualBracket,
          input.militaryIncentiveBracketEntryCount ?? 0,
        )
      : null;

  const femaleIncentiveDivisions =
    femaleAlloc > 0 && femaleIncentiveBracketUsed
      ? splitIncentivePoolAcrossDivisions(
          femaleAlloc,
          femDivN,
          femPlaces,
          femaleIncentiveBracketUsed,
          input.femaleIncentiveDivisionLabels,
        )
      : [];

  const militaryIncentiveDivisions =
    militaryAlloc > 0 && militaryIncentiveBracketUsed
      ? splitIncentivePoolAcrossDivisions(
          militaryAlloc,
          milDivN,
          milPlaces,
          militaryIncentiveBracketUsed,
          input.militaryIncentiveDivisionLabels,
        )
      : [];

  return {
    cashPayoutMode,
    guaranteedCashPayoutCents,
    companyFundedCashShortfallCents,
    bracketUsed,
    grossPotCents,
    processingFeeCents,
    netAfterProcessingCents,
    shootoutFundCents,
    prHoldingCents,
    racersPotCents,
    femaleIncentiveRequestedCents: reqFemale,
    militaryIncentiveRequestedCents: reqMilitary,
    femaleIncentiveCents,
    militaryIncentiveCents,
    contestantPoolLedgerCents,
    trueAddedMoneyCents: trueAdded,
    eliteCarveRequestedCents: carve,
    poolAfterCarveLedgerCents,
    contestantPoolCents,
    poolAfterCarveCents,
    evenSharePerDivisionCents,
    eliteDivisionCarveCents: effectiveCarve,
    producerCents,
    peerRacingOrgCents,
    divisions,
    totalContestantPayoutsCents,
    femaleIncentiveDivisions,
    militaryIncentiveDivisions,
    femaleIncentiveBracketUsed,
    militaryIncentiveBracketUsed,
    warnings,
  };
}
