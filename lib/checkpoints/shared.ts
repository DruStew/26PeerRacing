import { randomBytes } from "crypto";

export const CHECKPOINT_AUDIO_BUCKET = "checkpoint-audio";
export const MAX_CHECKPOINTS_PER_DISTANCE = 30;
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export const ALLOWED_AUDIO_MIME = new Map<string, string>([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/aac", "aac"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/ogg", "ogg"],
]);

// No 0/O/1/l/I — promoters read these tokens off printed signs when debugging.
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function newCheckpointToken(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += TOKEN_ALPHABET[b % TOKEN_ALPHABET.length];
  return out;
}

export function isValidCheckpointToken(token: string): boolean {
  return /^[A-Za-z0-9]{6,20}$/.test(token);
}

export function originFromRequest(request: Request): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "peerracing.com";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
