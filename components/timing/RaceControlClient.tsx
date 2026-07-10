"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Race Control — the finish-line laptop. Fires guns (with a 10s big-screen
 * countdown), runs per-distance race clocks, takes MARK/lap presses
 * (spacebar), and streams in camera crossings for one-tap confirm into the
 * Results Console. Optional auto-confirm handles clean tag reads so the
 * human only touches exceptions.
 */

type Distance = { id: string; label: string };
type Entry = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  assigned_bib: string | null;
  bib: string | null;
  distance_id: string;
};
type Session = { id: string; label: string; status: string; created_at: string };
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

const POLL_MS = 3000;

function fmtElapsed(ms: number, showTenths = true): string {
  const t = Math.floor((ms % 1000) / 100);
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  const base = `${h > 0 ? `${h}:` : ""}${String(m).padStart(h > 0 ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
  return showTenths ? `${base}.${t}` : base;
}

function fmtWall(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function clipUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/finish-clips/${path}`;
}

export function RaceControlClient({
  eventId,
  distances,
  entries,
  tagBindings,
  initialBigScreenPublic,
}: {
  eventId: string;
  distances: Distance[];
  entries: Entry[];
  tagBindings: { tag_id: number; entry_id: string }[];
  initialBigScreenPublic: boolean;
}) {
  const offsetRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const creatingSessionRef = useRef(false);
  const autoConfirmInFlight = useRef<Set<string>>(new Set());

  const [sessions, setSessions] = useState<Session[]>([]);
  const [gunMarks, setGunMarks] = useState<GunMark[]>([]);
  const [events, setEvents] = useState<FinishEvent[]>([]);
  const [clockStops, setClockStops] = useState<{ distance_id: string; stopped_at: string | null }[]>([]);
  const [dnfIds, setDnfIds] = useState<string[]>([]);
  const [checkedInIds, setCheckedInIds] = useState<string[]>([]);
  /** Distances where the "all racers finished" banner was dismissed without stopping. */
  const [finishPromptDismissed, setFinishPromptDismissed] = useState<Record<string, boolean>>({});
  const [bigScreenPublic, setBigScreenPublic] = useState(initialBigScreenPublic);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [assignDrafts, setAssignDrafts] = useState<Record<string, string>>({});
  const [searchDrafts, setSearchDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [pendingGun, setPendingGun] = useState<Record<string, boolean>>({});

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // ---- clock sync ------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
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
          // retry next loop
        }
      }
      if (!cancelled && best) offsetRef.current = Math.round(best.offset);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- live poll + UI tick ------------------------------------------------------
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/timing/live`, { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        ok: boolean;
        big_screen_public: boolean;
        sessions: Session[];
        gun_marks: GunMark[];
        events: FinishEvent[];
        clock_stops?: { distance_id: string; stopped_at: string | null }[];
        dnf_entry_ids?: string[];
        checked_in_entry_ids?: string[];
      };
      if (!json.ok) return;
      setSessions(json.sessions);
      setGunMarks(json.gun_marks);
      setEvents(json.events);
      setClockStops(json.clock_stops ?? []);
      setDnfIds(json.dnf_entry_ids ?? []);
      setCheckedInIds(json.checked_in_entry_ids ?? []);
      setBigScreenPublic(json.big_screen_public);
      const active = json.sessions.find((s) => s.status === "active");
      if (active) sessionIdRef.current = active.id;
    } catch {
      // offline blip — keep last state
    }
  }, [eventId]);

  useEffect(() => {
    void poll();
    const t = window.setInterval(() => void poll(), POLL_MS);
    const tick = window.setInterval(() => setNowTick(Date.now()), 100);
    return () => {
      window.clearInterval(t);
      window.clearInterval(tick);
    };
  }, [poll]);

  // ---- session ----------------------------------------------------------------
  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (creatingSessionRef.current) return null;
    creatingSessionRef.current = true;
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/timing/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Race Control", clock_offset_ms: offsetRef.current }),
      });
      const json = (await res.json()) as { ok: boolean; session?: { id: string }; error?: string };
      if (json.ok && json.session) {
        sessionIdRef.current = json.session.id;
        return json.session.id;
      }
      setError(json.error ?? "Could not start a timing session.");
      return null;
    } catch {
      setError("Could not reach the server.");
      return null;
    } finally {
      creatingSessionRef.current = false;
    }
  }, [eventId]);

  // ---- gun / countdown ----------------------------------------------------------
  const latestGunByDistance = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of gunMarks) {
      const t = new Date(g.gun_at).getTime();
      const prev = m.get(g.distance_id);
      if (prev === undefined || t > prev) m.set(g.distance_id, t);
    }
    return m;
  }, [gunMarks]);

  async function startRace(distanceId: string, delayMs: number) {
    setError(null);
    setPendingGun((p) => ({ ...p, [distanceId]: true }));
    try {
      const sid = await ensureSession();
      if (!sid) return;
      const gunAtMs = serverNow() + delayMs;
      const res = await fetch(`/api/promoter/events/${eventId}/timing/sessions/${sid}/gun`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distance_id: distanceId, gun_at_ms: gunAtMs }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) setError(json.error ?? "Could not set the gun.");
      await poll();
    } finally {
      setPendingGun((p) => ({ ...p, [distanceId]: false }));
    }
  }

  // ---- MARK ---------------------------------------------------------------------
  const mark = useCallback(async () => {
    const at = serverNow();
    const sid = await ensureSession();
    if (!sid) return;
    try {
      await fetch(`/api/promoter/events/${eventId}/timing/sessions/${sid}/finish-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              crossed_at_ms: Math.round(at),
              source: "mark",
              detail: { client_key: crypto.randomUUID(), from: "race-control" },
            },
          ],
        }),
      });
      void poll();
    } catch {
      setError("MARK didn't reach the server — check connection.");
    }
  }, [eventId, ensureSession, poll, serverNow]);

  // Spacebar = MARK (unless typing in an input).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      e.preventDefault();
      void mark();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mark]);

  // ---- data shaping ---------------------------------------------------------------
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const entryByTag = useMemo(() => {
    const m = new Map<number, Entry>();
    for (const b of tagBindings) {
      const e = entryById.get(b.entry_id);
      if (e) m.set(b.tag_id, e);
    }
    return m;
  }, [tagBindings, entryById]);
  const distanceById = useMemo(() => new Map(distances.map((d) => [d.id, d])), [distances]);

  function resolvedEntryFor(f: FinishEvent): Entry | null {
    const draft = assignDrafts[f.id];
    if (draft) return entryById.get(draft) ?? null;
    if (f.entry_id) return entryById.get(f.entry_id) ?? null;
    if (f.tag_id !== null) return entryByTag.get(f.tag_id) ?? null;
    return null;
  }

  function entryName(e: Entry): string {
    const name = [e.first_name, e.last_name].filter(Boolean).join(" ") || "(no name)";
    const bib = e.assigned_bib?.trim() || e.bib?.trim();
    return `${name}${bib ? ` · ${bib}` : ""}`;
  }

  function elapsedFor(f: FinishEvent, entry: Entry | null): number | null {
    if (!entry) return null;
    const gun = latestGunByDistance.get(entry.distance_id);
    if (gun === undefined) return null;
    const ms = new Date(f.crossed_at).getTime() - gun;
    return ms > 0 ? ms : null;
  }

  const proposed = useMemo(
    () => events.filter((f) => f.status === "proposed").sort((a, b) => b.crossed_at.localeCompare(a.crossed_at)),
    [events],
  );
  const confirmed = useMemo(() => events.filter((f) => f.status === "confirmed"), [events]);

  // ---- who is still on the course --------------------------------------------
  const stopByDistance = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clockStops) {
      if (c.stopped_at) m.set(c.distance_id, new Date(c.stopped_at).getTime());
    }
    return m;
  }, [clockStops]);
  const dnfSet = useMemo(() => new Set(dnfIds), [dnfIds]);
  const checkedInSet = useMemo(() => new Set(checkedInIds), [checkedInIds]);
  const finishedEntryIds = useMemo(() => {
    const s = new Set<string>();
    for (const f of confirmed) if (f.entry_id) s.add(f.entry_id);
    return s;
  }, [confirmed]);

  /** Checked-in runners per distance who have neither finished nor DNF'd. */
  const onCourseByDistance = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      if (!checkedInSet.has(e.id)) continue;
      if (finishedEntryIds.has(e.id) || dnfSet.has(e.id)) continue;
      const list = m.get(e.distance_id) ?? [];
      list.push(e);
      m.set(e.distance_id, list);
    }
    return m;
  }, [entries, checkedInSet, finishedEntryIds, dnfSet]);

  const dnfByDistance = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      if (!dnfSet.has(e.id)) continue;
      const list = m.get(e.distance_id) ?? [];
      list.push(e);
      m.set(e.distance_id, list);
    }
    return m;
  }, [entries, dnfSet]);

  // Re-arm the "all finished" banner if someone is back on course (late walk-up).
  useEffect(() => {
    setFinishPromptDismissed((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [distanceId, list] of onCourseByDistance) {
        if (list.length > 0 && next[distanceId]) {
          delete next[distanceId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [onCourseByDistance]);

  const checkedInCountByDistance = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      if (!checkedInSet.has(e.id)) continue;
      m.set(e.distance_id, (m.get(e.distance_id) ?? 0) + 1);
    }
    return m;
  }, [entries, checkedInSet]);

  // ---- stop / resume clock, DNF ------------------------------------------------
  const setClock = useCallback(
    async (distanceId: string, action: "stop" | "resume") => {
      try {
        const res = await fetch(`/api/promoter/events/${eventId}/timing/clock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            distance_id: distanceId,
            action,
            ...(action === "stop" ? { stopped_at_ms: Math.round(serverNow()) } : {}),
          }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) setError(json.error ?? "Clock update failed.");
        await poll();
      } catch {
        setError("Could not reach the server.");
      }
    },
    [eventId, poll, serverNow],
  );

  /** Stop with safety nets: 1 confirm when course is clear, 3 when runners are still out. */
  function stopClockGuarded(d: Distance) {
    const outstanding = onCourseByDistance.get(d.id) ?? [];
    if (outstanding.length === 0) {
      if (window.confirm(`All racers have completed the ${d.label} course. Stop the clock?`)) {
        void setClock(d.id, "stop");
      }
      return;
    }
    const names = outstanding.slice(0, 5).map(entryName).join(", ");
    const more = outstanding.length > 5 ? ` +${outstanding.length - 5} more` : "";
    if (
      !window.confirm(
        `Are you sure?? ${outstanding.length} racer${outstanding.length === 1 ? " is" : "s are"} still on the course:\n\n${names}${more}`,
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        `Stopping the clock ends timing for ${d.label}. Racers still out will need to be marked DNF (or the clock resumed). Continue?`,
      )
    ) {
      return;
    }
    if (window.confirm(`FINAL CONFIRMATION — stop the ${d.label} clock now?`)) {
      void setClock(d.id, "stop");
    }
  }

  const setDnf = useCallback(
    async (entryId: string, action: "mark" | "unmark") => {
      try {
        const res = await fetch(`/api/promoter/events/${eventId}/timing/dnf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entry_id: entryId, action }),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) setError(json.error ?? "DNF update failed.");
        await poll();
      } catch {
        setError("Could not reach the server.");
      }
    },
    [eventId, poll],
  );
  const gapAlerts = useMemo(
    () => events.filter((f) => (f.detail as { camera_gap?: boolean }).camera_gap === true).slice(-3),
    [events],
  );

  // ---- actions -----------------------------------------------------------------
  const patchEvent = useCallback(
    async (feId: string, body: Record<string, unknown>) => {
      setBusyId(feId);
      try {
        const res = await fetch(`/api/promoter/events/${eventId}/timing/finish-events/${feId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { ok: boolean; error?: string };
        if (!json.ok) setError(json.error ?? "Action failed.");
        await poll();
        return json.ok;
      } catch {
        setError("Could not reach the server.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [eventId, poll],
  );

  // ---- auto-confirm ---------------------------------------------------------------
  useEffect(() => {
    if (!autoConfirm) return;
    for (const f of proposed) {
      if (f.source !== "tag") continue;
      if ((f.detail as { approx?: boolean }).approx === true) continue;
      const entry = f.entry_id ? entryById.get(f.entry_id) : null;
      if (!entry) continue;
      if (latestGunByDistance.get(entry.distance_id) === undefined) continue;
      if (autoConfirmInFlight.current.has(f.id)) continue;
      autoConfirmInFlight.current.add(f.id);
      void patchEvent(f.id, { action: "confirm", entry_id: entry.id }).finally(() =>
        autoConfirmInFlight.current.delete(f.id),
      );
    }
  }, [autoConfirm, proposed, entryById, latestGunByDistance, patchEvent]);

  async function toggleBigScreen() {
    const next = !bigScreenPublic;
    setBigScreenPublic(next);
    await fetch(`/api/promoter/events/${eventId}/timing/big-screen`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public: next }),
    }).catch(() => setBigScreenPublic(!next));
  }

  // ---- leaderboard ----------------------------------------------------------------
  const leaderboard = useMemo(() => {
    const byDistance = new Map<string, { name: string; elapsed: number }[]>();
    for (const f of confirmed) {
      const entry = f.entry_id ? entryById.get(f.entry_id) : null;
      if (!entry || f.elapsed_ms === null) continue;
      const list = byDistance.get(entry.distance_id) ?? [];
      list.push({ name: entryName(entry), elapsed: f.elapsed_ms });
      byDistance.set(entry.distance_id, list);
    }
    for (const list of byDistance.values()) list.sort((a, b) => a.elapsed - b.elapsed);
    return byDistance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed, entryById]);

  const now = nowTick + offsetRef.current;

  return (
    <div>
      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}{" "}
          <button type="button" className="underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </p>
      ) : null}

      {gapAlerts.length > 0 ? (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          ⚠ Camera interruption reported — check the feed below for gaps and hand-MARK anyone who
          finished during them.
        </div>
      ) : null}

      {/* guns + clocks */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {distances.map((d) => {
          const gun = latestGunByDistance.get(d.id);
          const stoppedAt = stopByDistance.get(d.id);
          const counting = gun !== undefined && gun > now;
          const stopped = gun !== undefined && stoppedAt !== undefined;
          const running = gun !== undefined && gun <= now && !stopped;
          const onCourse = onCourseByDistance.get(d.id) ?? [];
          const dnfList = dnfByDistance.get(d.id) ?? [];
          const checkedInCount = checkedInCountByDistance.get(d.id) ?? 0;
          const allFinished = running && checkedInCount > 0 && onCourse.length === 0;
          return (
            <div key={d.id} className="rounded-xl border border-[#1E3A5F]/15 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">{d.label}</p>
              {counting ? (
                <p className="font-display mt-1 text-4xl font-black tabular-nums text-[#E87722]">
                  {Math.max(0, Math.ceil((gun - now) / 1000))}
                </p>
              ) : stopped ? (
                <p className="font-display mt-1 text-4xl font-black tabular-nums text-emerald-700">
                  {fmtElapsed(Math.max(0, stoppedAt - gun), false)}
                  <span className="ml-2 align-middle text-sm font-bold uppercase tracking-wide text-emerald-700/80">
                    Final — clock stopped
                  </span>
                </p>
              ) : running ? (
                <p className="font-display mt-1 text-4xl font-black tabular-nums text-[#1E3A5F]">
                  {fmtElapsed(now - gun, false)}
                </p>
              ) : (
                <p className="mt-1 text-2xl font-bold text-[#1E3A5F]/40">— not started —</p>
              )}

              {allFinished && !finishPromptDismissed[d.id] ? (
                <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5">
                  <p className="text-sm font-bold text-emerald-800">
                    🎉 All racers have completed the course!
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => stopClockGuarded(d)}
                      className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700/90"
                    >
                      Stop the clock
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinishPromptDismissed((p) => ({ ...p, [d.id]: true }))}
                      className="rounded-md border border-emerald-700/30 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      Keep it running
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {!running && !counting && !stopped ? (
                  <>
                    <button
                      type="button"
                      disabled={pendingGun[d.id]}
                      onClick={() => void startRace(d.id, 10_000)}
                      className="rounded-lg bg-[#E87722] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#E87722]/90 disabled:opacity-50"
                    >
                      Start Race (10s countdown)
                    </button>
                    <button
                      type="button"
                      disabled={pendingGun[d.id]}
                      onClick={() => void startRace(d.id, 0)}
                      className="rounded-lg border border-[#1E3A5F]/25 px-3 py-2.5 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722]"
                    >
                      Gun now
                    </button>
                  </>
                ) : stopped ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Resume the ${d.label} clock? It picks up from the original gun time.`)) {
                        void setClock(d.id, "resume");
                      }
                    }}
                    className="rounded-lg border border-[#1E3A5F]/20 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F]/60 hover:border-[#E87722] hover:text-[#1E3A5F]"
                  >
                    Resume clock
                  </button>
                ) : (
                  <>
                    {running ? (
                      <button
                        type="button"
                        onClick={() => stopClockGuarded(d)}
                        className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-700/90"
                      >
                        Stop clock
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pendingGun[d.id]}
                      onClick={() => {
                        if (window.confirm(`Re-fire the gun for ${d.label}? This resets its start time.`)) {
                          void startRace(d.id, 0);
                        }
                      }}
                      className="rounded-lg border border-[#1E3A5F]/20 px-3 py-1.5 text-xs font-semibold text-[#1E3A5F]/60 hover:border-red-300 hover:text-red-700"
                    >
                      Re-fire gun
                    </button>
                  </>
                )}
              </div>

              {/* still on course + DNF */}
              {(running || stopped) && checkedInCount > 0 ? (
                <div className="mt-4 border-t border-[#1E3A5F]/10 pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
                    Still on course ({onCourse.length} of {checkedInCount} checked in)
                  </p>
                  {onCourse.length === 0 ? (
                    <p className="mt-1.5 text-sm font-medium text-emerald-700">Course is clear.</p>
                  ) : (
                    <ul className="mt-1.5 max-h-44 space-y-1 overflow-y-auto pr-1">
                      {onCourse.map((e) => (
                        <li key={e.id} className="flex items-center justify-between gap-2 text-sm text-[#1E3A5F]">
                          <span className="min-w-0 truncate">{entryName(e)}</span>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Mark ${entryName(e)} as DNF (did not finish)?`)) {
                                void setDnf(e.id, "mark");
                              }
                            }}
                            className="shrink-0 rounded-md border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            DNF
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {dnfList.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-red-700/70">
                        DNF ({dnfList.length})
                      </p>
                      <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1">
                        {dnfList.map((e) => (
                          <li key={e.id} className="flex items-center justify-between gap-2 text-sm text-[#1E3A5F]/60">
                            <span className="min-w-0 truncate line-through">{entryName(e)}</span>
                            <button
                              type="button"
                              onClick={() => void setDnf(e.id, "unmark")}
                              className="shrink-0 rounded-md border border-[#1E3A5F]/20 px-2 py-0.5 text-xs font-semibold text-[#1E3A5F]/60 hover:border-[#E87722]"
                            >
                              undo
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* MARK + toggles */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void mark()}
          className="flex-1 rounded-xl bg-violet-700 px-8 py-5 text-2xl font-black text-white shadow-md active:scale-[0.98] sm:flex-none"
        >
          MARK
        </button>
        <span className="text-xs text-[#1E3A5F]/55">(or press spacebar)</span>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm font-medium text-[#1E3A5F]">
          <input
            type="checkbox"
            checked={autoConfirm}
            onChange={(e) => setAutoConfirm(e.target.checked)}
            className="h-4 w-4 accent-[#E87722]"
          />
          Auto-confirm clean tag reads
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#1E3A5F]">
          <input
            type="checkbox"
            checked={bigScreenPublic}
            onChange={() => void toggleBigScreen()}
            className="h-4 w-4 accent-[#E87722]"
          />
          Big screen public
        </label>
        <Link
          href={`/events/${eventId}/big-screen`}
          target="_blank"
          className="text-sm font-semibold text-[#E87722] hover:underline"
        >
          Open big screen ↗
        </Link>
      </div>

      {/* crossing feed */}
      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
          Crossings — to review ({proposed.length})
        </h2>
        {proposed.length === 0 ? (
          <p className="mt-2 text-sm text-[#1E3A5F]/60">Waiting for finishers…</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {proposed.map((f) => {
              const entry = resolvedEntryFor(f);
              const elapsed = elapsedFor(f, entry);
              const detail = f.detail as { approx?: boolean; camera_gap?: boolean; clip_path?: string };
              const search = searchDrafts[f.id] ?? "";
              const matches =
                !entry && search.trim().length >= 1
                  ? entries
                      .filter((e) => {
                        const hay = `${e.first_name ?? ""} ${e.last_name ?? ""} ${e.assigned_bib ?? ""} ${e.bib ?? ""}`.toLowerCase();
                        return hay.includes(search.trim().toLowerCase());
                      })
                      .slice(0, 6)
                  : [];
              if (detail.camera_gap) {
                return (
                  <li key={f.id} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">
                    ⚠ Camera gap around {fmtWall(f.crossed_at)} — anyone finishing then needs a manual MARK/entry.
                    <button
                      type="button"
                      onClick={() => void patchEvent(f.id, { action: "dismiss" })}
                      className="ml-3 text-xs underline"
                    >
                      acknowledge
                    </button>
                  </li>
                );
              }
              return (
                <li key={f.id} className="rounded-xl border border-[#1E3A5F]/10 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold tabular-nums text-[#1E3A5F]">
                      {fmtWall(f.crossed_at)}
                    </span>
                    {f.tag_id !== null ? (
                      <span className="rounded bg-violet-100 px-2 py-0.5 font-mono text-xs font-bold text-violet-800">
                        TAG {String(f.tag_id).padStart(3, "0")}
                      </span>
                    ) : (
                      <span className="rounded bg-[#1E3A5F]/10 px-2 py-0.5 text-xs font-semibold text-[#1E3A5F]/70">
                        {f.source.toUpperCase()}
                      </span>
                    )}
                    {detail.approx ? (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">approx</span>
                    ) : null}
                    {elapsed !== null ? (
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold tabular-nums text-emerald-800">
                        {fmtElapsed(elapsed)}
                      </span>
                    ) : null}
                    {detail.clip_path ? (
                      <button
                        type="button"
                        onClick={() => setPlayingClip(playingClip === f.id ? null : (detail.clip_path as string))}
                        className="rounded bg-[#1E3A5F] px-2 py-0.5 text-xs font-semibold text-white hover:bg-[#1E3A5F]/90"
                      >
                        ▶ clip
                      </button>
                    ) : null}
                    <div className="ml-auto flex items-center gap-2">
                      {entry ? (
                        <span className="text-sm font-medium text-[#1E3A5F]">
                          {entryName(entry)}
                          <span className="ml-1 text-xs text-[#1E3A5F]/50">
                            {distanceById.get(entry.distance_id)?.label ?? ""}
                          </span>
                        </span>
                      ) : (
                        <div className="relative">
                          <input
                            value={search}
                            onChange={(e) => setSearchDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))}
                            placeholder="Assign: name or bib…"
                            className="w-48 rounded-lg border border-[#1E3A5F]/20 px-3 py-1.5 text-sm"
                          />
                          {matches.length > 0 ? (
                            <ul className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-[#1E3A5F]/15 bg-white shadow-lg">
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
                                    {entryName(m)} · {distanceById.get(m.distance_id)?.label ?? ""}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )}
                      <button
                        type="button"
                        disabled={busyId === f.id || !entry}
                        onClick={() => {
                          if (entry) void patchEvent(f.id, { action: "confirm", entry_id: entry.id });
                        }}
                        className="rounded-md bg-[#E87722] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#E87722]/90 disabled:opacity-40"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={busyId === f.id}
                        onClick={() => void patchEvent(f.id, { action: "dismiss" })}
                        className="rounded-md border border-[#1E3A5F]/25 px-2.5 py-1.5 text-xs font-semibold text-[#1E3A5F]/60 hover:border-red-300 hover:text-red-700"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  {playingClip && (f.detail as { clip_path?: string }).clip_path === playingClip ? (
                    <video src={clipUrl(playingClip)} controls autoPlay playsInline className="mt-2 max-h-72 w-full rounded-lg bg-black" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* leaderboard */}
      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
          Unofficial leaderboard ({confirmed.length} confirmed)
        </h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {distances.map((d) => {
            const list = leaderboard.get(d.id) ?? [];
            return (
              <div key={d.id} className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">{d.label}</p>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-[#1E3A5F]/50">No confirmed finishers yet.</p>
                ) : (
                  <ol className="mt-2 space-y-1 text-sm">
                    {list.slice(0, 10).map((r, i) => (
                      <li key={`${r.name}-${i}`} className="flex justify-between text-[#1E3A5F]">
                        <span>
                          <span className="mr-2 font-bold tabular-nums">{i + 1}.</span>
                          {r.name}
                        </span>
                        <span className="font-mono font-semibold tabular-nums">{fmtElapsed(r.elapsed)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
