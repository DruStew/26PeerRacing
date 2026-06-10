/**
 * Peer Racing division algorithm — TypeScript port of `26_PR Program/src`.
 * The Python program remains the source of truth; parity is verified by
 * `scripts/algorithm-parity/` which diffs both implementations on the same field.
 */

export { AlgorithmEntry, parseFinishTimeSeconds, parseRow, sortEntries } from "./entry";
export type { ParseIndices } from "./entry";
export {
  PAYOUT_SPREAD_LOOKUP,
  DIVISION_NAMES,
  calculateNumPayoutSlots,
  calculateNumDivisions,
  IncentiveDivision,
  RaceFinances,
} from "./master-calculator";
export type {
  IncentiveDivisionConfig,
  IncentiveDivisionType,
  IncentiveCriteria,
  RaceFinancesInput,
} from "./master-calculator";
export { runPreAlgorithm } from "./pre-algorithm";
export type { PreAlgorithmResult } from "./pre-algorithm";
export { runAlgorithm, filterIncentiveEntries } from "./peer-racing-algorithm";
export type {
  AlgorithmDivisionsConfig,
  AlgorithmRunResult,
  AlgorithmDiagnostics,
  PayoutSource,
} from "./peer-racing-algorithm";
