"use client";

/**
 * Device-local storage for finish-cam recordings and the offline event
 * outbox. Video never has to leave the phone; only tiny crossing events
 * sync to the server (retried whenever signal allows).
 */

const DB_NAME = "pr-timing";
const DB_VERSION = 1;

export type VideoChunk = {
  id?: number;
  sessionId: string;
  segmentId: string;
  seq: number;
  blob: Blob;
};

export type SegmentMeta = {
  /** `${sessionId}:${segmentId}` */
  key: string;
  sessionId: string;
  segmentId: string;
  /** Server-clock epoch ms when recording started. */
  startMs: number;
  mimeType: string;
};

export type OutboxEvent = {
  id?: number;
  sessionId: string;
  tag_id: number | null;
  crossed_at_ms: number;
  source: "tag" | "mark" | "motion" | "manual";
  detail: Record<string, unknown>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("chunks")) {
        const chunks = db.createObjectStore("chunks", { keyPath: "id", autoIncrement: true });
        chunks.createIndex("bySession", "sessionId");
        chunks.createIndex("bySegment", ["sessionId", "segmentId", "seq"]);
      }
      if (!db.objectStoreNames.contains("segments")) {
        db.createObjectStore("segments", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const outbox = db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        outbox.createIndex("bySession", "sessionId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveChunk(chunk: VideoChunk): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("chunks", "readwrite");
  tx.objectStore("chunks").add(chunk);
  await txDone(tx);
  db.close();
}

export async function saveSegmentMeta(meta: SegmentMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("segments", "readwrite");
  tx.objectStore("segments").put(meta);
  await txDone(tx);
  db.close();
}

export async function listSegments(sessionId: string): Promise<SegmentMeta[]> {
  const db = await openDb();
  const tx = db.transaction("segments", "readonly");
  const all: SegmentMeta[] = await new Promise((resolve, reject) => {
    const req = tx.objectStore("segments").getAll();
    req.onsuccess = () => resolve(req.result as SegmentMeta[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.filter((s) => s.sessionId === sessionId).sort((a, b) => a.startMs - b.startMs);
}

export async function loadSegmentBlob(
  sessionId: string,
  segmentId: string,
  mimeType: string,
): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction("chunks", "readonly");
  const idx = tx.objectStore("chunks").index("bySession");
  const all: VideoChunk[] = await new Promise((resolve, reject) => {
    const req = idx.getAll(sessionId);
    req.onsuccess = () => resolve(req.result as VideoChunk[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  const parts = all.filter((c) => c.segmentId === segmentId).sort((a, b) => a.seq - b.seq);
  if (parts.length === 0) return null;
  return new Blob(
    parts.map((p) => p.blob),
    { type: mimeType },
  );
}

export async function queueOutbox(event: OutboxEvent): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("outbox", "readwrite");
  tx.objectStore("outbox").add(event);
  await txDone(tx);
  db.close();
}

export async function peekOutbox(sessionId: string, limit = 50): Promise<OutboxEvent[]> {
  const db = await openDb();
  const tx = db.transaction("outbox", "readonly");
  const all: OutboxEvent[] = await new Promise((resolve, reject) => {
    const req = tx.objectStore("outbox").index("bySession").getAll(sessionId);
    req.onsuccess = () => resolve(req.result as OutboxEvent[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return all.slice(0, limit);
}

export async function removeOutbox(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  const tx = db.transaction("outbox", "readwrite");
  for (const id of ids) tx.objectStore("outbox").delete(id);
  await txDone(tx);
  db.close();
}

export async function storageEstimate(): Promise<{ usedMb: number; quotaMb: number } | null> {
  try {
    const est = await navigator.storage.estimate();
    return {
      usedMb: Math.round((est.usage ?? 0) / 1048576),
      quotaMb: Math.round((est.quota ?? 0) / 1048576),
    };
  } catch {
    return null;
  }
}
