/** Shared pin colors + types for the unified race map (editor + public viewer). */

export const PIN_COLORS = {
  start: "#16a34a",
  finish: "#dc2626",
  aid: "#0d9488",
  checkpoint: "#7c3aed",
} as const;

export type RaceMapPinKind = keyof typeof PIN_COLORS;

export const PIN_LABELS: Record<RaceMapPinKind, string> = {
  start: "Start line",
  finish: "Finish line",
  aid: "Aid station",
  checkpoint: "Checkpoint",
};

export type RaceMapPin = {
  kind: RaceMapPinKind;
  name: string;
  lat: number;
  lng: number;
  mile?: string | null;
  /** Promoter note to runners, shown in the pin popup. */
  note?: string | null;
  dropBags?: boolean;
};
