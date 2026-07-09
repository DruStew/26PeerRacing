"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  openRearCamera,
  stopStream,
  TagDetectorLoop,
  type TagDetection,
} from "@/components/timing/tag-detection";
import {
  peekOutbox,
  queueOutbox,
  removeOutbox,
  saveChunk,
  saveSegmentMeta,
  storageEstimate,
} from "@/components/timing/capture-store";

/**
 * Finish Cam: continuous recording + live tag detection at the finish line.
 *
 * Time model: crossing timestamps are converted to server-clock epoch ms via
 * an NTP-style offset measured at session start, so gun marks and crossings
 * share one clock even across devices. Only tiny crossing events go to the
 * server (offline outbox, retried); video stays on this device for review.
 */

type Distance = { id: string; label: string; gunFired: boolean };

type Props = {
  eventId: string;
  distances: { id: string; label: string }[];
};

type LinePoint = { x: number; y: number }; // normalized 0..1 in video space

type TrackedTag = {
  lastCx: number;
  lastCy: number;
  lastPerf: number;
  emitted: boolean;
  firstSeenPerf: number;
};

const APPROX_EMIT_AFTER_MS = 5000;

function lineSide(p: { x: number; y: number }, a: LinePoint, b: LinePoint): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

export function FinishCamClient({ eventId, distances: distancesIn }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<TagDetectorLoop | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const seqRef = useRef(0);
  const segmentIdRef = useRef<string>("");
  const trackedRef = useRef<Map<number, TrackedTag>>(new Map());
  const offsetRef = useRef(0);
  const sessionRef = useRef<string | null>(null);
  const lineRef = useRef<{ a: LinePoint; b: LinePoint }>({
    a: { x: 0.5, y: 0.05 },
    b: { x: 0.5, y: 0.95 },
  });

  const [phase, setPhase] = useState<"setup" | "live" | "ended">("setup");
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [distances, setDistances] = useState<Distance[]>(
    distancesIn.map((d) => ({ ...d, gunFired: false })),
  );
  const [detections, setDetections] = useState<{ tagId: number; at: string; approx: boolean }[]>([]);
  const [markCount, setMarkCount] = useState(0);
  const [pendingOutbox, setPendingOutbox] = useState(0);
  const [online, setOnline] = useState(true);
  const [storage, setStorage] = useState<{ usedMb: number; quotaMb: number } | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [line, setLine] = useState(lineRef.current);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // ---- clock sync ------------------------------------------------------------
  const syncClock = useCallback(async (): Promise<number | null> => {
    let best: { rtt: number; offset: number } | null = null;
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch("/api/timing/clock", { cache: "no-store" });
        const t1 = Date.now();
        const json = (await res.json()) as { server_ms: number };
        const rtt = t1 - t0;
        const offset = json.server_ms - (t0 + rtt / 2);
        if (!best || rtt < best.rtt) best = { rtt, offset };
      } catch {
        // offline — fall through
      }
    }
    if (!best) return null;
    offsetRef.current = Math.round(best.offset);
    setOffsetMs(offsetRef.current);
    return offsetRef.current;
  }, []);

  // ---- camera ---------------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await openRearCamera(video, { width: 1280, height: 720 });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        setCameraReady(true);
      } catch {
        if (!cancelled) setError("Could not open the camera. Check permissions and reload.");
      }
    })();
    void syncClock();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      loopRef.current?.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopStream(streamRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Screen wake lock while live.
  useEffect(() => {
    if (phase !== "live") return;
    let lock: { release: () => Promise<void> } | null = null;
    (async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        // best-effort
      }
    })();
    return () => {
      void lock?.release().catch(() => undefined);
    };
  }, [phase]);

  // ---- crossing detection -----------------------------------------------------
  const emitCrossing = useCallback(
    (tagId: number | null, crossedAtMs: number, source: "tag" | "mark", approx: boolean) => {
      const sid = sessionRef.current;
      if (!sid) return;
      void queueOutbox({
        sessionId: sid,
        tag_id: tagId,
        crossed_at_ms: Math.round(crossedAtMs),
        source,
        detail: approx ? { approx: true } : {},
      }).then(() => setPendingOutbox((n) => n + 1));
      if (tagId !== null) {
        setDetections((prev) =>
          [
            {
              tagId,
              at: new Date(crossedAtMs).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
              }),
              approx,
            },
            ...prev,
          ].slice(0, 12),
        );
      }
    },
    [],
  );

  const handleDetections = useCallback(
    (dets: TagDetection[]) => {
      const video = videoRef.current;
      if (!video) return;
      const vw = video.videoWidth || 1;
      const vh = video.videoHeight || 1;
      const { a, b } = lineRef.current;
      const tracked = trackedRef.current;

      for (const d of dets) {
        const p = { x: d.cx / vw, y: d.cy / vh };
        const prev = tracked.get(d.tagId);
        if (prev && !prev.emitted) {
          const s1 = lineSide({ x: prev.lastCx, y: prev.lastCy }, a, b);
          const s2 = lineSide(p, a, b);
          if (s1 !== 0 && s2 !== 0 && s1 !== s2) {
            // Crossed between the two frames — interpolate the moment.
            const t = 0.5;
            const perfAt = prev.lastPerf + (d.atPerfMs - prev.lastPerf) * t;
            const epoch = performance.timeOrigin + perfAt + offsetRef.current;
            emitCrossing(d.tagId, epoch, "tag", false);
            tracked.set(d.tagId, {
              lastCx: p.x,
              lastCy: p.y,
              lastPerf: d.atPerfMs,
              emitted: true,
              firstSeenPerf: prev.firstSeenPerf,
            });
            continue;
          }
        }
        tracked.set(d.tagId, {
          lastCx: p.x,
          lastCy: p.y,
          lastPerf: d.atPerfMs,
          emitted: prev?.emitted ?? false,
          firstSeenPerf: prev?.firstSeenPerf ?? d.atPerfMs,
        });
      }
    },
    [emitCrossing],
  );

  // Safety net: a tag that was seen but never crossed the drawn line (detection
  // dropout at the moment of crossing) still produces an approximate event.
  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(() => {
      const nowPerf = performance.now();
      for (const [tagId, t] of trackedRef.current) {
        if (!t.emitted && nowPerf - t.lastPerf > APPROX_EMIT_AFTER_MS) {
          const epoch = performance.timeOrigin + t.lastPerf + offsetRef.current;
          emitCrossing(tagId, epoch, "tag", true);
          trackedRef.current.set(tagId, { ...t, emitted: true });
        }
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [phase, emitCrossing]);

  // ---- outbox flush -----------------------------------------------------------
  useEffect(() => {
    if (phase !== "live" && phase !== "ended") return;
    const timer = window.setInterval(async () => {
      const sid = sessionRef.current;
      if (!sid || !navigator.onLine) return;
      const batch = await peekOutbox(sid);
      if (batch.length === 0) {
        setPendingOutbox(0);
        return;
      }
      try {
        const res = await fetch(
          `/api/promoter/events/${eventId}/timing/sessions/${sid}/finish-events`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              events: batch.map((b) => ({
                tag_id: b.tag_id,
                crossed_at_ms: b.crossed_at_ms,
                source: b.source,
                detail: b.detail,
              })),
            }),
          },
        );
        const json = (await res.json()) as { ok: boolean };
        if (json.ok) {
          await removeOutbox(batch.map((b) => b.id!).filter((n) => n !== undefined));
          const left = await peekOutbox(sid, 1);
          setPendingOutbox(left.length);
        }
      } catch {
        // stay queued
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [phase, eventId]);

  // ---- record timer / storage meter -------------------------------------------
  useEffect(() => {
    if (phase !== "live") return;
    const t = window.setInterval(() => {
      setRecordSeconds((s) => s + 1);
      if (Math.random() < 0.1) void storageEstimate().then(setStorage);
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // ---- session lifecycle -------------------------------------------------------
  async function startSession() {
    setError(null);
    const stream = streamRef.current;
    if (!stream) {
      setError("Camera not ready.");
      return;
    }
    const offset = await syncClock();
    if (offset === null) {
      setError(
        "No connection for the clock sync. Get signal once before the race (the session needs a synced clock), then start.",
      );
      return;
    }

    try {
      const res = await fetch(`/api/promoter/events/${eventId}/timing/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clock_offset_ms: offset }),
      });
      const json = (await res.json()) as { ok: boolean; session?: { id: string }; error?: string };
      if (!json.ok || !json.session) {
        setError(json.error ?? "Could not start the session.");
        return;
      }
      const sid = json.session.id;
      sessionRef.current = sid;
      setSessionId(sid);

      // Start recording.
      const mimeType = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find((t) =>
        MediaRecorder.isTypeSupported(t),
      );
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });
      const segmentId = crypto.randomUUID();
      segmentIdRef.current = segmentId;
      seqRef.current = 0;
      recorder.onstart = () => {
        void saveSegmentMeta({
          key: `${sid}:${segmentId}`,
          sessionId: sid,
          segmentId,
          startMs: serverNow(),
          mimeType: recorder.mimeType || "video/webm",
        });
      };
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          void saveChunk({
            sessionId: sid,
            segmentId,
            seq: seqRef.current++,
            blob: e.data,
          });
        }
      };
      recorder.start(15000);
      recorderRef.current = recorder;

      // Start detection.
      const video = videoRef.current!;
      const loop = new TagDetectorLoop(video, handleDetections, { intervalMs: 120 });
      loopRef.current = loop;
      loop.start();

      setPhase("live");
      void storageEstimate().then(setStorage);
    } catch {
      setError("Could not reach the server to start the session.");
    }
  }

  async function fireGun(distanceId: string) {
    const sid = sessionRef.current;
    if (!sid) return;
    const gunAtMs = serverNow();
    try {
      const res = await fetch(
        `/api/promoter/events/${eventId}/timing/sessions/${sid}/gun`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ distance_id: distanceId, gun_at_ms: gunAtMs }),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Could not save the gun mark.");
        return;
      }
      setDistances((prev) => prev.map((d) => (d.id === distanceId ? { ...d, gunFired: true } : d)));
    } catch {
      setError("Gun mark queued failed — no signal. Re-fire when signal returns (elapsed times need it).");
    }
  }

  function mark() {
    emitCrossing(null, serverNow(), "mark", false);
    setMarkCount((n) => n + 1);
  }

  async function endSession() {
    loopRef.current?.stop();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    const sid = sessionRef.current;
    if (sid) {
      try {
        await fetch(`/api/promoter/events/${eventId}/timing/sessions/${sid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ end: true }),
        });
      } catch {
        // review page works regardless
      }
    }
    setPhase("ended");
  }

  // ---- line dragging -----------------------------------------------------------
  const dragRef = useRef<"a" | "b" | null>(null);
  function lineHandlePos(p: LinePoint, rect: DOMRect) {
    return { left: p.x * rect.width, top: p.y * rect.height };
  }
  function onPointerDown(which: "a" | "b") {
    return (e: React.PointerEvent) => {
      dragRef.current = which;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };
  }
  function onPointerMove(e: React.PointerEvent) {
    const which = dragRef.current;
    const container = containerRef.current;
    if (!which || !container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const next = { ...lineRef.current, [which]: { x, y } };
    lineRef.current = next;
    setLine(next);
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  const recordClock = useMemo(() => {
    const h = Math.floor(recordSeconds / 3600);
    const m = Math.floor((recordSeconds % 3600) / 60);
    const s = recordSeconds % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [recordSeconds]);

  return (
    <div>
      {/* camera + line overlay */}
      <div
        ref={containerRef}
        className="relative mt-4 touch-none overflow-hidden rounded-xl bg-black"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <video ref={videoRef} className="max-h-[52vh] w-full object-contain" playsInline muted />
        {/* finish line */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <line
            x1={`${line.a.x * 100}%`}
            y1={`${line.a.y * 100}%`}
            x2={`${line.b.x * 100}%`}
            y2={`${line.b.y * 100}%`}
            stroke="#E87722"
            strokeWidth={3}
            strokeDasharray="8 6"
          />
        </svg>
        {(["a", "b"] as const).map((which) => {
          const rect = containerRef.current?.getBoundingClientRect();
          const p = line[which];
          const pos = rect ? lineHandlePos(p, rect) : { left: 0, top: 0 };
          return (
            <button
              key={which}
              type="button"
              aria-label={`Finish line handle ${which}`}
              onPointerDown={onPointerDown(which)}
              className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#E87722] shadow"
              style={{ left: pos.left, top: pos.top }}
            />
          );
        })}
        {phase === "live" ? (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            REC {recordClock}
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-[#1E3A5F]/60">
        Drag the two orange handles so the dashed line lies exactly on your finish line. Crossings
        are timed the moment a tag&apos;s center passes it.
      </p>

      {/* status strip */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${cameraReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {cameraReady ? "Camera ready" : "Opening camera…"}
        </span>
        <span className={`rounded-full px-2.5 py-1 font-semibold ${offsetMs !== null ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {offsetMs !== null ? `Clock synced (${offsetMs >= 0 ? "+" : ""}${offsetMs}ms)` : "Clock not synced"}
        </span>
        <span className={`rounded-full px-2.5 py-1 font-semibold ${online ? "bg-emerald-100 text-emerald-800" : "bg-[#1E3A5F]/10 text-[#1E3A5F]/70"}`}>
          {online ? "Online" : `Offline — ${pendingOutbox} queued`}
        </span>
        {storage ? (
          <span className="rounded-full bg-[#1E3A5F]/10 px-2.5 py-1 font-semibold text-[#1E3A5F]/70">
            Storage {storage.usedMb} / {storage.quotaMb} MB
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}

      {/* controls */}
      {phase === "setup" ? (
        <button
          type="button"
          disabled={!cameraReady}
          onClick={() => void startSession()}
          className="mt-4 w-full rounded-xl bg-[#E87722] px-6 py-4 text-lg font-bold text-white shadow-md hover:bg-[#E87722]/90 disabled:opacity-50 sm:w-auto"
        >
          Start session & record
        </button>
      ) : null}

      {phase === "live" ? (
        <>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {distances.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => void fireGun(d.id)}
                className={`rounded-xl border-2 px-4 py-3 text-left font-bold ${
                  d.gunFired
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-[#1E3A5F] bg-[#1E3A5F] text-white hover:bg-[#1E3A5F]/90"
                }`}
              >
                {d.gunFired ? `✓ Gun fired — ${d.label} (tap to re-fire)` : `GUN — ${d.label}`}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={mark}
              className="flex-1 rounded-xl bg-violet-700 px-6 py-5 text-xl font-black text-white shadow-md active:scale-[0.98] sm:flex-none sm:px-10"
            >
              MARK{markCount > 0 ? ` (${markCount})` : ""}
            </button>
            <button
              type="button"
              onClick={() => void endSession()}
              className="rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              End session
            </button>
          </div>
          <p className="mt-2 text-xs text-[#1E3A5F]/60">
            MARK is optional — tap it when someone crosses to bookmark the moment for review. Tag
            wearers are detected automatically.
          </p>

          {detections.length > 0 ? (
            <div className="mt-4 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                Live detections
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {detections.map((d, i) => (
                  <li key={`${d.tagId}-${i}`} className="flex items-center gap-2 text-[#1E3A5F]">
                    <span className="rounded bg-violet-100 px-2 py-0.5 font-mono text-xs font-bold text-violet-800">
                      TAG {String(d.tagId).padStart(3, "0")}
                    </span>
                    <span className="tabular-nums">{d.at}</span>
                    {d.approx ? (
                      <span className="text-xs text-amber-700">~approx (verify in review)</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {phase === "ended" ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-semibold text-emerald-900">Session ended.</p>
          <p className="mt-1 text-sm text-emerald-900/80">
            Recording is saved on this device{pendingOutbox > 0 ? `; ${pendingOutbox} crossings still uploading (keep this page open until it hits zero)` : " and all crossings are synced"}.
          </p>
          <Link
            href={`/promoter/events/${eventId}/timing/review${sessionId ? `?session=${sessionId}` : ""}`}
            className="mt-3 inline-flex rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90"
          >
            Review & assign finishes →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
