"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { listSegments, loadSegmentBlob, type SegmentMeta } from "@/components/timing/capture-store";

/**
 * Review & Assign: every camera crossing becomes a row; tag-bound rows come
 * pre-filled with the runner. Confirming computes elapsed vs the gun mark and
 * writes the provisional time into results_raw (Results Console pipeline).
 * If this device holds the session's recording, a video panel lets the
 * promoter scrub to any crossing and adjust it frame by frame.
 */

type Session = { id: string; label: string; status: string; created_at: string };
type Distance = { id: string; label: string };
type Entry = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  assigned_bib: string | null;
  bib: string | null;
  distance_id: string;
};
type GunMark = { session_id: string; distance_id: string; gun_at: string };
type FinishEvent = {
  id: string;
  session_id: string;
  distance_id: string | null;
  entry_id: string | null;
  tag_id: number | null;
  crossed_at: string;
  elapsed_ms: number | null;
  source: string;
  status: string;
  detail: Record<string, unknown>;
};

const FRAME_S = 1 / 30;

function fmtElapsed(ms: number): string {
  const cs = Math.floor((ms % 1000) / 10);
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(h > 0 ? 2 : 1, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function fmtWall(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function TimingReviewClient({
  eventId,
  initialSessionId,
  sessions,
  distances,
  entries,
  tagBindings,
  gunMarks,
  finishEvents,
}: {
  eventId: string;
  initialSessionId: string | null;
  sessions: Session[];
  distances: Distance[];
  entries: Entry[];
  tagBindings: { tag_id: number; entry_id: string }[];
  gunMarks: GunMark[];
  finishEvents: FinishEvent[];
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(
    initialSessionId ?? sessions[0]?.id ?? null,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignDrafts, setAssignDrafts] = useState<Record<string, string>>({});
  const [searchDrafts, setSearchDrafts] = useState<Record<string, string>>({});

  // ---- video (device-local) ---------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [segments, setSegments] = useState<SegmentMeta[]>([]);
  const [activeSegment, setActiveSegment] = useState<SegmentMeta | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoAvailable, setVideoAvailable] = useState<boolean | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    void listSegments(sessionId).then((segs) => {
      if (cancelled) return;
      setSegments(segs);
      setVideoAvailable(segs.length > 0);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const openSegmentAt = useCallback(
    async (epochMs: number) => {
      if (!sessionId || segments.length === 0) return;
      // Segment containing the moment (or the last one starting before it).
      const seg =
        [...segments].reverse().find((s) => s.startMs <= epochMs) ?? segments[0];
      if (!seg) return;
      if (activeSegment?.key !== seg.key) {
        const blob = await loadSegmentBlob(sessionId, seg.segmentId, seg.mimeType);
        if (!blob) return;
        if (videoUrl) URL.revokeObjectURL(videoUrl);
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        setActiveSegment(seg);
        // Seek after metadata loads.
        window.setTimeout(() => {
          const v = videoRef.current;
          if (v) v.currentTime = Math.max(0, (epochMs - seg.startMs) / 1000 - 2);
        }, 300);
      } else {
        const v = videoRef.current;
        if (v) v.currentTime = Math.max(0, (epochMs - seg.startMs) / 1000 - 2);
      }
    },
    [sessionId, segments, activeSegment, videoUrl],
  );

  function stepFrame(dir: 1 | -1) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + dir * FRAME_S);
  }

  function currentFrameEpoch(): number | null {
    const v = videoRef.current;
    if (!v || !activeSegment) return null;
    return activeSegment.startMs + v.currentTime * 1000;
  }

  // ---- data shaping -----------------------------------------------------------
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const distanceById = useMemo(() => new Map(distances.map((d) => [d.id, d])), [distances]);
  const entryByTag = useMemo(() => {
    const m = new Map<number, Entry>();
    for (const b of tagBindings) {
      const e = entryById.get(b.entry_id);
      if (e) m.set(b.tag_id, e);
    }
    return m;
  }, [tagBindings, entryById]);

  const gunBySessionDistance = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gunMarks) m.set(`${g.session_id}:${g.distance_id}`, new Date(g.gun_at).getTime());
    return m;
  }, [gunMarks]);

  const sessionEvents = useMemo(
    () => finishEvents.filter((f) => f.session_id === sessionId),
    [finishEvents, sessionId],
  );
  const proposed = sessionEvents.filter((f) => f.status === "proposed");
  const confirmed = sessionEvents.filter((f) => f.status === "confirmed");

  function entryName(e: Entry): string {
    const name = [e.first_name, e.last_name].filter(Boolean).join(" ") || "(no name)";
    const bib = e.assigned_bib?.trim() || e.bib?.trim();
    const dist = distanceById.get(e.distance_id)?.label;
    return `${name}${bib ? ` · bib ${bib}` : ""}${dist ? ` · ${dist}` : ""}`;
  }

  function resolvedEntryFor(f: FinishEvent): Entry | null {
    const draft = assignDrafts[f.id];
    if (draft) return entryById.get(draft) ?? null;
    if (f.entry_id) return entryById.get(f.entry_id) ?? null;
    if (f.tag_id !== null) return entryByTag.get(f.tag_id) ?? null;
    return null;
  }

  function elapsedPreview(f: FinishEvent): { ms: number | null; missingGun: boolean } {
    const entry = resolvedEntryFor(f);
    if (!entry || !sessionId) return { ms: null, missingGun: false };
    const gun = gunBySessionDistance.get(`${sessionId}:${entry.distance_id}`);
    if (gun === undefined) return { ms: null, missingGun: true };
    const ms = new Date(f.crossed_at).getTime() - gun;
    return { ms: ms > 0 ? ms : null, missingGun: false };
  }

  // ---- actions ----------------------------------------------------------------
  async function patchEvent(feId: string, body: Record<string, unknown>) {
    setBusyId(feId);
    setError(null);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/timing/finish-events/${feId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Action failed.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmEvent(f: FinishEvent) {
    const entry = resolvedEntryFor(f);
    if (!entry) {
      setError("Pick a runner first.");
      return;
    }
    await patchEvent(f.id, { action: "confirm", entry_id: entry.id });
  }

  async function setCrossingToFrame(f: FinishEvent) {
    const epoch = currentFrameEpoch();
    if (epoch === null) return;
    await patchEvent(f.id, { action: "update", crossed_at_ms: Math.round(epoch) });
  }

  async function addFinisherAtFrame() {
    if (!sessionId) return;
    const epoch = currentFrameEpoch();
    if (epoch === null) {
      setError("Open the video and scrub to the crossing first.");
      return;
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/promoter/events/${eventId}/timing/sessions/${sessionId}/finish-events`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            events: [{ crossed_at_ms: Math.round(epoch), source: "manual", detail: { from: "review" } }],
          }),
        },
      );
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Could not add the finisher.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="mt-8 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] px-6 py-10 text-center text-sm text-[#1E3A5F]/70">
        No timing sessions yet. Start one on the{" "}
        <Link href={`/promoter/events/${eventId}/timing`} className="font-semibold text-[#E87722] hover:underline">
          Finish Cam
        </Link>{" "}
        page.
      </p>
    );
  }

  return (
    <div className="mt-6">
      {/* session picker */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-[#1E3A5F]/70">
          Session{" "}
          <select
            value={sessionId ?? ""}
            onChange={(e) => setSessionId(e.target.value)}
            className="ml-1 rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm"
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {new Date(s.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                {s.status === "active" ? " (live)" : ""}
              </option>
            ))}
          </select>
        </label>
        <span className="text-sm text-[#1E3A5F]/60">
          {proposed.length} to review · {confirmed.length} confirmed
        </span>
      </div>

      {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}

      {/* video panel */}
      <div className="mt-5 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
          Recording (stays on the capture device)
        </p>
        {videoAvailable === false ? (
          <p className="mt-2 text-sm text-[#1E3A5F]/65">
            No recording found on this device — open this page on the phone that filmed the finish
            to scrub video. You can still confirm crossings below.
          </p>
        ) : (
          <>
            <video ref={videoRef} src={videoUrl ?? undefined} controls playsInline className="mt-2 max-h-[40vh] w-full rounded-lg bg-black" />
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => stepFrame(-1)} className="rounded-md border border-[#1E3A5F]/25 bg-white px-3 py-1.5 text-xs font-semibold hover:border-[#E87722]">
                ◀ 1 frame
              </button>
              <button type="button" onClick={() => stepFrame(1)} className="rounded-md border border-[#1E3A5F]/25 bg-white px-3 py-1.5 text-xs font-semibold hover:border-[#E87722]">
                1 frame ▶
              </button>
              <button type="button" onClick={() => void addFinisherAtFrame()} className="rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E3A5F]/90">
                + Add finisher at this frame
              </button>
              {selectedEventId ? (
                <button
                  type="button"
                  onClick={() => {
                    const f = sessionEvents.find((x) => x.id === selectedEventId);
                    if (f) void setCrossingToFrame(f);
                  }}
                  className="rounded-md bg-[#E87722] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E87722]/90"
                >
                  Set selected crossing to this frame
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* proposals */}
      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold">To review ({proposed.length})</h2>
        {proposed.length === 0 ? (
          <p className="mt-2 text-sm text-[#1E3A5F]/60">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {proposed.map((f) => {
              const entry = resolvedEntryFor(f);
              const preview = elapsedPreview(f);
              const approx = f.detail && (f.detail as { approx?: boolean }).approx === true;
              const search = searchDrafts[f.id] ?? "";
              const matches =
                search.trim().length >= 1
                  ? entries
                      .filter((e) => {
                        const hay = `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.assigned_bib ?? ""} ${e.bib ?? ""}`.toLowerCase();
                        return hay.includes(search.trim().toLowerCase());
                      })
                      .slice(0, 6)
                  : [];
              return (
                <li
                  key={f.id}
                  className={`rounded-xl border p-4 ${
                    selectedEventId === f.id ? "border-[#E87722] bg-[#fff8f3]" : "border-[#1E3A5F]/10 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEventId(f.id);
                        void openSegmentAt(new Date(f.crossed_at).getTime());
                      }}
                      className="rounded-md bg-[#1E3A5F]/5 px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-[#1E3A5F] hover:bg-[#1E3A5F]/10"
                      title="Jump video to this crossing"
                    >
                      {fmtWall(f.crossed_at)}
                    </button>
                    {f.tag_id !== null ? (
                      <span className="rounded bg-violet-100 px-2 py-0.5 font-mono text-xs font-bold text-violet-800">
                        TAG {String(f.tag_id).padStart(3, "0")}
                      </span>
                    ) : (
                      <span className="rounded bg-[#1E3A5F]/10 px-2 py-0.5 text-xs font-semibold text-[#1E3A5F]/70">
                        {f.source.toUpperCase()}
                      </span>
                    )}
                    {approx ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        approx — verify on video
                      </span>
                    ) : null}
                    {preview.ms !== null ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-800">
                        {fmtElapsed(preview.ms)}
                      </span>
                    ) : preview.missingGun ? (
                      <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                        no gun mark for this distance
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {entry ? (
                      <p className="text-sm font-medium text-[#1E3A5F]">{entryName(entry)}</p>
                    ) : (
                      <div className="relative">
                        <input
                          value={search}
                          onChange={(e) =>
                            setSearchDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))
                          }
                          placeholder="Type name or bib…"
                          className="w-64 rounded-lg border border-[#1E3A5F]/20 px-3 py-2 text-sm"
                        />
                        {matches.length > 0 ? (
                          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-[#1E3A5F]/15 bg-white shadow-lg">
                            {matches.map((m) => (
                              <li key={m.id}>
                                <button
                                  type="button"
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-[#fff8f3]"
                                  onClick={() => {
                                    setAssignDrafts((prev) => ({ ...prev, [f.id]: m.id }));
                                    setSearchDrafts((prev) => ({ ...prev, [f.id]: "" }));
                                  }}
                                >
                                  {entryName(m)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                    <div className="flex gap-2">
                      {entry && assignDrafts[f.id] ? (
                        <button
                          type="button"
                          onClick={() =>
                            setAssignDrafts((prev) => {
                              const next = { ...prev };
                              delete next[f.id];
                              return next;
                            })
                          }
                          className="rounded-md border border-[#1E3A5F]/25 px-3 py-1.5 text-xs font-semibold hover:border-[#E87722]"
                        >
                          Change
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyId === f.id || !entry}
                        onClick={() => void confirmEvent(f)}
                        className="rounded-md bg-[#E87722] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
                      >
                        {busyId === f.id ? "Saving…" : "Confirm time"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === f.id}
                        onClick={() => void patchEvent(f.id, { action: "dismiss" })}
                        className="rounded-md border border-[#1E3A5F]/25 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F]/70 hover:border-red-300 hover:text-red-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* confirmed */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Confirmed ({confirmed.length})</h2>
        {confirmed.length === 0 ? (
          <p className="mt-2 text-sm text-[#1E3A5F]/60">
            Confirmed times appear here and in the Results Console.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[#1E3A5F]/10 rounded-xl border border-[#1E3A5F]/10 bg-white">
            {confirmed.map((f) => {
              const entry = f.entry_id ? entryById.get(f.entry_id) : null;
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="font-medium text-[#1E3A5F]">
                    {entry ? entryName(entry) : "(runner removed)"}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-emerald-800">
                    {f.elapsed_ms !== null ? fmtElapsed(f.elapsed_ms) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-3 text-sm text-[#1E3A5F]/65">
          Confirmed times flow into the{" "}
          <Link href={`/promoter/events/${eventId}/results`} className="font-semibold text-[#E87722] hover:underline">
            Results Console
          </Link>{" "}
          exactly like manual or CSV times.
        </p>
      </section>
    </div>
  );
}
