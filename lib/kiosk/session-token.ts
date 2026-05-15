import { createHash, randomBytes } from "crypto";

import "server-only";

function pepper(): string {
  return process.env.EVENT_KIOSK_SECRET?.trim() ?? "";
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(pepper()).update("|").update(token).digest("hex");
}

export function newSessionToken(): string {
  return randomBytes(24).toString("base64url");
}
