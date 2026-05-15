import { createHmac } from "crypto";

import "server-only";

function secret(): string {
  const s = process.env.EVENT_KIOSK_SECRET?.trim();
  if (!s) {
    throw new Error("EVENT_KIOSK_SECRET is not set");
  }
  return s;
}

/** 6-digit string (100000–999999) derived from event + local date + version + kind. */
export function deriveKioskCode(
  eventId: string,
  localDate: string,
  generationVersion: number,
  kind: "kiosk" | "auth",
): string {
  const h = createHmac("sha256", secret())
    .update(`${eventId}|${localDate}|${generationVersion}|${kind}`)
    .digest("hex");
  const n = Number.parseInt(h.slice(0, 12), 16) % 900_000;
  return String(100_000 + n);
}

export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}
