import { PAYOUT_BRACKET_ORDER } from "./schedule";
import type { PayoutBracketId } from "./types";

/** Map entry count to the schedule column (same logic as the spreadsheet headers). */
export function entryCountToBracket(entryCount: number): PayoutBracketId {
  if (entryCount <= 0) return "<10";
  if (entryCount <= 9) return "<10";
  if (entryCount <= 20) return "11 to 20";
  if (entryCount <= 40) return "21-40";
  if (entryCount <= 60) return "41-60";
  if (entryCount <= 90) return "61-90";
  if (entryCount <= 120) return "91-120";
  if (entryCount <= 150) return "121-150";
  if (entryCount <= 180) return "151-180";
  if (entryCount <= 210) return "181-210";
  if (entryCount <= 240) return "211-240";
  if (entryCount <= 270) return "241-270";
  return "271-300";
}

export function isValidBracketId(s: string): s is PayoutBracketId {
  return (PAYOUT_BRACKET_ORDER as string[]).includes(s);
}
