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
 * Recording is segmented (~30s self-contained files, dashcam style): each
 * segment is independently playable, which powers instant replay on this
 * phone and per-crossing clip uploads to Race Control — all while capture
 * keeps running. Crossing timestamps ride a server-synced clock; tiny
 * crossing events sync through an offline outbox; video stays on-device
 * except the segments that contain finishers.
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

type LocalSegment = {
  segmentId: string;
  startMs: number;
  endMs: number;
  blob: Blob;
  mimeType: string;
};

type ClipJob = {
  segmentId: string;
  blob: Blob;
  startMs: number;
  keys: string[];
  attempts: number;
};

const APPROX_EMIT_AFTER_MS = 5000;
const SEGMENT_MS = 30_000;
const MAX_MEMORY_SEGMENTS = 30;

function lineSide(p: { x: number; y: number }, a: LinePoint, b: LinePoint): number {
  return Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
}

export function FinishCamClient({ eventId, distances: distancesIn }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const replayRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<TagDetectorLoop | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const segmentTimerRef = useRef<number | null>(null);
  const trackedRef = useRef<Map<number, TrackedTag>>(new Map());
  const offsetRef = useRef(0);
  const sessionRef = useRef<string | null>(null);
  const phaseRef = useRef<"setup" | "live" | "ended">("setup");
  const gapStartRef = useRef<number | null>(null);
  const segmentsRef = useRef<LocalSegment[]>([]);
  const clipCrossingsRef = useRef<{ key: string; epoch: number }[]>([]);
  const clipQueueRef = useRef<ClipJob[]>([]);
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
  const [pendingClips, setPendingClips] = useState(0);
  const [online, setOnline] = useState(true);
  const [storage, setStorage] = useState<{ usedMb: number; quotaMb: number } | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [line, setLine] = useState(lineRef.current);
  const [replaySegments, setReplaySegments] = useState<LocalSegment[]>([]);
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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

  // ---- segmented recording ------------------------------------------------------
  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    const sid = sessionRef.current;
    if (!stream || !sid || phaseRef.current !== "live") return;

    const mimeType = ["video/mp4", "video/webm;codecs=vp8", "video/webm"].find((t) =>
      MediaRecorder.isTypeSupported(t),
    );
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
    } catch {
      setError("Recording is not supported on this phone/browser.");
      return;
    }
    const segmentId = crypto.randomUUID();
    const startMs = serverNow();

    recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const endMs = serverNow();
      const seg: LocalSegment = {
        segmentId,
        startMs,
        endMs,
        blob: e.data,
        mimeType: recorder.mimeType || "video/webm",
      };
      segmentsRef.current.push(seg);
      if (segmentsRef.current.length > MAX_MEMORY_SEGMENTS) segmentsRef.current.shift();
      setReplaySegments([...segmentsRef.current]);

      // Persist for the review page (device-local).
      void saveSegmentMeta({
        key: `${sid}:${segmentId}`,
        sessionId: sid,
        segmentId,
        startMs,
        mimeType: seg.mimeType,
      });
      void saveChunk({ sessionId: sid, segmentId, seq: 0, blob: e.data });

      // Queue clip upload if any crossings happened inside this segment.
      const keys = clipCrossingsRef.current
        .filter((c) => c.epoch >= startMs - 1500 && c.epoch <= endMs + 1500)
        .map((c) => c.key);
      if (keys.length > 0) {
        clipQueueRef.current.push({ segmentId, blob: e.data, startMs, keys, attempts: 0 });
        setPendingClips(clipQueueRef.current.length);
        clipCrossingsRef.current = clipCrossingsRef.current.filter((c) => !keys.includes(c.key));
      }
    };
    recorder.start();
    recorderRef.current = recorder;

    // Roll to the next segment.
    segmentTimerRef.current = window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
      startSegment();
    }, SEGMENT_MS);
  }, [serverNow]);

  const stopRecording = useCallback(() => {
    if (segmentTimerRef.current !== null) {
      window.clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  // ---- camera ---------------------------------------------------------------
  const openCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;
    try {
      stopStream(streamRef.current);
      const stream = await openRearCamera(video, { width: 1280, height: 720 });
      streamRef.current = stream;
      setCameraReady(true);
      return true;
    } catch {
      setError("Could not open the camera. Check permissions and reload.");
      setCameraReady(false);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await openCamera();
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
      if (segmentTimerRef.current !== null) window.clearTimeout(segmentTimerRef.current);
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

  // ---- event emit -----------------------------------------------------------------
  const emitEvent = useCallback(
    (
      tagId: number | null,
      crossedAtMs: number,
      source: "tag" | "mark",
      detail: Record<string, unknown>,
    ) => {
      const sid = sessionRef.current;
      if (!sid) return;
      const clientKey = crypto.randomUUID();
      void queueOutbox({
        sessionId: sid,
        tag_id: tagId,
        crossed_at_ms: Math.round(crossedAtMs),
        source,
        detail: { ...detail, client_key: clientKey },
      }).then(() => setPendingOutbox((n) => n + 1));
      // Real crossings (not gap reports) get a clip from the covering segment.
      if (!detail.camera_gap) {
        clipCrossingsRef.current.push({ key: clientKey, epoch: crossedAtMs });
      }
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
              approx: detail.approx === true,
            },
            ...prev,
          ].slice(0, 12),
        );
      }
    },
    [],
  );

  // ---- camera-gap watchdog ----------------------------------------------------------
  useEffect(() => {
    function onVisibility() {
      if (phaseRef.current !== "live") return;
      if (document.hidden) {
        if (gapStartRef.current === null) gapStartRef.current = serverNow();
      } else if (gapStartRef.current !== null) {
        const from = gapStartRef.current;
        gapStartRef.current = null;
        const to = serverNow();
        // Report the outage so Race Control shows a red alert.
        emitEvent(null, from, "mark", { camera_gap: true, from_ms: from, to_ms: to });
        // Recover recording if the interruption killed the recorder.
        if (recorderRef.current?.state !== "recording") {
          stopRecording();
          void openCamera().then((ok) => {
            if (ok) startSegment();
          });
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [emitEvent, openCamera, serverNow, startSegment, stopRecording]);

  // ---- crossing detection -----------------------------------------------------
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
            const perfAt = prev.lastPerf + (d.atPerfMs - prev.lastPerf) * 0.5;
            const epoch = performance.timeOrigin + perfAt + offsetRef.current;
            emitEvent(d.tagId, epoch, "tag", {});
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
    [emitEvent],
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
          emitEvent(tagId, epoch, "tag", { approx: true });
          trackedRef.current.set(tagId, { ...t, emitted: true });
        }
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [phase, emitEvent]);

  // ---- outbox + clip upload loops -----------------------------------------------------
  useEffect(() => {
    if (phase === "setup") return;
    const timer = window.setInterval(async () => {
      const sid = sessionRef.current;
      if (!sid || !navigator.onLine) return;

      // 1. crossing events
      const batch = await peekOutbox(sid);
      if (batch.length > 0) {
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
          }
        } catch {
          // stay queued
        }
      }
      const left = await peekOutbox(sid, 1000);
      setPendingOutbox(left.length);

      // 2. clips (one per tick to keep bandwidth polite)
      const job = clipQueueRef.current[0];
      if (job) {
        try {
          const form = new FormData();
          form.set("client_keys", JSON.stringify(job.keys));
          form.set("clip_start_ms", String(job.startMs));
          form.set("segment_id", job.segmentId);
          form.set(
            "file",
            new File([job.blob], `${job.segmentId}.webm`, { type: job.blob.type || "video/webm" }),
          );
          const res = await fetch(
            `/api/promoter/events/${eventId}/timing/sessions/${sid}/clip`,
            { method: "POST", body: form },
          );
          const json = (await res.json()) as { ok: boolean; retry?: boolean; matched_keys?: string[] };
          if (json.ok) {
            // Partial match: some crossings hadn't synced yet — keep retrying
            // the job with just the unmatched keys so those runners still get
            // the clip attached.
            const matched = new Set(json.matched_keys ?? []);
            const remaining = job.keys.filter((k) => !matched.has(k));
            if (remaining.length > 0 && job.attempts < 20) {
              job.keys = remaining;
              job.attempts += 1;
            } else {
              clipQueueRef.current.shift();
            }
          } else if (json.retry) {
            // Crossings not synced yet — retry later (cap attempts).
            job.attempts += 1;
            if (job.attempts > 20) clipQueueRef.current.shift();
          } else {
            clipQueueRef.current.shift();
          }
        } catch {
          job.attempts += 1;
          if (job.attempts > 20) clipQueueRef.current.shift();
        }
        setPendingClips(clipQueueRef.current.length);
      }
    }, 6000);
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
    if (!streamRef.current) {
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
        body: JSON.stringify({ label: "Finish Cam", clock_offset_ms: offset }),
      });
      const json = (await res.json()) as { ok: boolean; session?: { id: string }; error?: string };
      if (!json.ok || !json.session) {
        setError(json.error ?? "Could not start the session.");
        return;
      }
      sessionRef.current = json.session.id;
      setSessionId(json.session.id);
      setPhase("live");
      phaseRef.current = "live";
      startSegment();

      const video = videoRef.current!;
      const loop = new TagDetectorLoop(video, handleDetections, { intervalMs: 120 });
      loopRef.current = loop;
      loop.start();
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
      setError("Gun mark failed — no signal. Re-fire when signal returns (elapsed times need it).");
    }
  }

  function mark() {
    emitEvent(null, serverNow(), "mark", { from: "finish-cam" });
    setMarkCount((n) => n + 1);
  }

  async function endSession() {
    loopRef.current?.stop();
    stopRecording();
    setPhase("ended");
    phaseRef.current = "ended";
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
  }

  // ---- instant replay ------------------------------------------------------------
  function openReplay(seg: LocalSegment) {
    if (replayUrl) URL.revokeObjectURL(replayUrl);
    const url = URL.createObjectURL(seg.blob);
    setReplayUrl(url);
    setReplayOpen(true);
  }
  function replayStep(dir: 1 | -1) {
    const v = replayRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + dir * (1 / 30));
  }
  useEffect(() => {
    return () => {
      if (replayUrl) URL.revokeObjectURL(replayUrl);
    };
  }, [replayUrl]);

  // ---- line dragging -----------------------------------------------------------
  const dragRef = useRef<"a" | "b" | null>(null);
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
          const p = line[which];
          return (
            <button
              key={which}
              type="button"
              aria-label={`Finish line handle ${which}`}
              onPointerDown={onPointerDown(which)}
              className="absolute z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[#E87722] shadow"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
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
        Landscape phone on a tripod. Drag the two orange handles so the dashed line lies exactly on
        your finish line. Pre-race checklist: <strong>airplane mode + WiFi on</strong>, Do Not
        Disturb, auto-lock off — a phone call mid-race interrupts the camera.
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
          {online ? "Online" : "Offline"}
        </span>
        {pendingOutbox > 0 ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-800">
            {pendingOutbox} crossings queued
          </span>
        ) : null}
        {pendingClips > 0 ? (
          <span className="rounded-full bg-[#1E3A5F]/10 px-2.5 py-1 font-semibold text-[#1E3A5F]/70">
            {pendingClips} clips uploading
          </span>
        ) : null}
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
          <p className="mt-1 text-xs text-[#1E3A5F]/55">
            Guns are usually fired from Race Control on the laptop — these buttons are the backup.
          </p>

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
              onClick={() => setReplayOpen((o) => !o)}
              className="rounded-xl border border-[#1E3A5F]/25 bg-white px-4 py-3 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722]"
            >
              {replayOpen ? "Hide replay" : "Instant replay"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("End the timing session? Recording stops.")) void endSession();
              }}
              className="rounded-xl border border-red-300 bg-white px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              End session
            </button>
          </div>

          {replayOpen ? (
            <div className="mt-3 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                Instant replay — recording continues
              </p>
              {replaySegments.length === 0 ? (
                <p className="mt-2 text-sm text-[#1E3A5F]/60">
                  First 30-second segment is still writing — replay appears here shortly.
                </p>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[...replaySegments]
                      .slice(-6)
                      .reverse()
                      .map((seg) => (
                        <button
                          key={seg.segmentId}
                          type="button"
                          onClick={() => openReplay(seg)}
                          className="rounded-md border border-[#1E3A5F]/25 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722]"
                        >
                          {new Date(seg.startMs).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </button>
                      ))}
                  </div>
                  {replayUrl ? (
                    <>
                      <video ref={replayRef} src={replayUrl} controls playsInline className="mt-2 max-h-64 w-full rounded-lg bg-black" />
                      <div className="mt-2 flex gap-2">
                        <button type="button" onClick={() => replayStep(-1)} className="rounded-md border border-[#1E3A5F]/25 bg-white px-3 py-1.5 text-xs font-semibold hover:border-[#E87722]">
                          ◀ 1 frame
                        </button>
                        <button type="button" onClick={() => replayStep(1)} className="rounded-md border border-[#1E3A5F]/25 bg-white px-3 py-1.5 text-xs font-semibold hover:border-[#E87722]">
                          1 frame ▶
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

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
            Recording is saved on this device
            {pendingOutbox + pendingClips > 0
              ? `; ${pendingOutbox} crossings and ${pendingClips} clips still uploading — keep this page open until both hit zero.`
              : " and everything is synced."}
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
