"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  openRearCamera,
  stopStream,
  TagDetectorLoop,
  type TagDetection,
} from "@/components/timing/tag-detection";

/**
 * Kiosk timing-tag binder: point the camera at the sticker, the tag number
 * locks on, one tap binds it to the runner. Used inline in the check-in desk.
 */
export function TimingTagScanner({
  eventId,
  entryId,
  runnerName,
  onBound,
  onClose,
  onLockChange,
}: {
  eventId: string;
  entryId: string;
  runnerName: string;
  onBound: (tagId: number) => void;
  onClose: () => void;
  /** True while a tag is locked on screen but not yet bound — lets the parent guard its own close paths. */
  onLockChange?: (locked: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<TagDetectorLoop | null>(null);
  const recentRef = useRef<number[]>([]);

  const [lockedTag, setLockedTag] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A tag is locked on screen but not yet bound and the user hit Close. */
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    onLockChange?.(lockedTag !== null);
    return () => onLockChange?.(false);
  }, [lockedTag, onLockChange]);

  const handleDetections = useCallback((dets: TagDetection[]) => {
    if (dets.length === 0) return;
    // Lock when the same tag is seen 3 detections in a row (kills misreads).
    const id = dets[0].tagId;
    const recent = recentRef.current;
    recent.push(id);
    if (recent.length > 3) recent.shift();
    if (recent.length === 3 && recent.every((r) => r === id)) {
      setLockedTag(id);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    (async () => {
      try {
        const stream = await openRearCamera(video, { width: 960, height: 540 });
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const loop = new TagDetectorLoop(video, handleDetections, { intervalMs: 150 });
        loopRef.current = loop;
        loop.start();
      } catch {
        if (!cancelled) setCameraError("Could not open the camera. Check permissions.");
      }
    })();

    return () => {
      cancelled = true;
      loopRef.current?.stop();
      stopStream(streamRef.current);
    };
  }, [handleDetections]);

  async function bind() {
    if (lockedTag === null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/kiosk/check-in/bind-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, entry_id: entryId, tag_id: lockedTag }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        rebound_from?: string | null;
        error?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "Could not bind the tag.");
        return;
      }
      onBound(lockedTag);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-violet-300/70 bg-violet-50/50 p-3" onClick={(ev) => ev.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
          Scan timing tag · {runnerName}
        </p>
        <button
          type="button"
          onClick={() => {
            // Guard: a tag is on screen but was never attached to the runner.
            if (lockedTag !== null && !busy) {
              setConfirmClose(true);
              return;
            }
            onClose();
          }}
          className="rounded-md border border-[#1E3A5F]/25 bg-white px-2.5 py-1 text-xs font-semibold text-[#1E3A5F] hover:border-[#E87722]"
        >
          Close
        </button>
      </div>

      {confirmClose && lockedTag !== null ? (
        <div className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">
            ⚠ Tag {String(lockedTag).padStart(3, "0")} is NOT attached to {runnerName} yet!
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            If you close now, this runner will have no timing tag and won&apos;t be picked up by
            the finish camera.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmClose(false);
                void bind();
              }}
              className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700/90 disabled:opacity-50"
            >
              Attach tag {String(lockedTag).padStart(3, "0")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-amber-700/40 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Close without attaching
            </button>
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              className="rounded-md border border-[#1E3A5F]/20 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F]/60"
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {cameraError ? (
        <p className="mt-3 text-sm font-medium text-red-700">{cameraError}</p>
      ) : (
        <>
          <div className="relative mt-2 overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="h-44 w-full object-cover" playsInline muted />
            <div
              className={`absolute inset-x-0 bottom-0 px-3 py-1.5 text-center text-sm font-bold ${
                lockedTag !== null ? "bg-emerald-600/90 text-white" : "bg-black/60 text-white/90"
              }`}
            >
              {lockedTag !== null
                ? `Tag ${String(lockedTag).padStart(3, "0")} locked`
                : "Point at the sticker…"}
            </div>
          </div>
          <button
            type="button"
            disabled={lockedTag === null || busy}
            onClick={() => void bind()}
            className="mt-2 w-full rounded-md bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700/90 disabled:opacity-50"
          >
            {busy
              ? "Binding…"
              : lockedTag !== null
                ? `Bind tag ${String(lockedTag).padStart(3, "0")} to ${runnerName}`
                : "Waiting for tag…"}
          </button>
        </>
      )}
      {error ? <p className="mt-2 text-sm font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
