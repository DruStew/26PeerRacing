import type { PayoutBracketId } from "./types";

/**
 * Fixed payout weights from the “Payout Schedule” tab (places 1–12 × brackets).
 * `null` means that place does not receive a share in that bracket column.
 */
export const PAYOUT_BRACKET_ORDER: PayoutBracketId[] = [
  "<10",
  "11 to 20",
  "21-40",
  "41-60",
  "61-90",
  "91-120",
  "121-150",
  "151-180",
  "181-210",
  "211-240",
  "241-270",
  "271-300",
];

/** Rows 1st–12th; each inner array is one bracket column left-to-right. */
export const PAYOUT_SCHEDULE: Record<PayoutBracketId, (number | null)[]> = {
  "<10": [1.0, null, null, null, null, null, null, null, null, null, null, null],
  "11 to 20": [0.6, 0.4, null, null, null, null, null, null, null, null, null, null],
  "21-40": [0.5, 0.3, 0.2, null, null, null, null, null, null, null, null, null],
  "41-60": [0.4, 0.3, 0.2, 0.1, null, null, null, null, null, null, null, null],
  "61-90": [0.35, 0.25, 0.2, 0.14, 0.07, null, null, null, null, null, null, null],
  "91-120": [0.33, 0.23, 0.17, 0.12, 0.09, 0.06, null, null, null, null, null, null],
  "121-150": [0.3, 0.21, 0.17, 0.12, 0.09, 0.07, 0.05, null, null, null, null, null],
  "151-180": [0.28, 0.19, 0.16, 0.12, 0.09, 0.08, 0.06, 0.04, null, null, null, null],
  "181-210": [0.26, 0.18, 0.15, 0.11, 0.09, 0.07, 0.06, 0.05, 0.04, null, null, null],
  "211-240": [0.24, 0.18, 0.14, 0.11, 0.09, 0.07, 0.06, 0.05, 0.04, 0.03, null, null],
  "241-270": [0.23, 0.17, 0.13, 0.11, 0.09, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, null],
  "271-300": [0.22, 0.17, 0.12, 0.09, 0.08, 0.07, 0.06, 0.05, 0.04, 0.04, 0.03, 0.03],
};
