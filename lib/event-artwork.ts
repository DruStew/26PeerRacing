export const EVENT_ARTWORK_BUCKET = "event-artwork";

/** 5 MB */
export const MAX_EVENT_ARTWORK_BYTES = 5 * 1024 * 1024;

export const ALLOWED_EVENT_ARTWORK_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function extFromArtworkMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mime] ?? "jpg";
}

/** Path inside bucket from public object URL, or null if not our bucket. */
export function storagePathFromArtworkPublicUrl(url: string): string | null {
  const marker = "/object/public/event-artwork/";
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}
