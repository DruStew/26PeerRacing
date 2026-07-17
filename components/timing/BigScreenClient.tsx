"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Vertical big-screen show: pre-race roster scroll → 10-second race
 * countdown ("GO! GO! GO!") → live finishers with full-screen celebration
 * pops → official results (divisions, places) once the promoter publishes.
 * Polls every 5s; also fine on a phone at home when the board is public.
 */

type Distance = {
  id: string;
  label: string;
  published: boolean;
  gun_at_ms: number | null;
  stopped_at_ms: number | null;
};
type RosterRow = { distance_id: string; name: string; bib: string | null };
type LiveFinisher = {
  entry_id: string;
  distance_id: string;
  name: string;
  bib: string | null;
  time_ms: number;
  time_display: string | null;
};
type OfficialRow = {
  distance_id: string;
  name: string;
  bib: string | null;
  finish_time_ms: number;
  overall_rank: number | null;
  division: string | null;
  division_place: number | null;
  payout_cents: number | null;
};

type Feed = {
  event_name: string;
  distances: Distance[];
  roster: RosterRow[];
  live_finishers: LiveFinisher[];
  official_results: OfficialRow[];
};

const POLL_MS = 5000;
const POP_MS = 5000;

const DIVISION_COLORS: Record<string, string> = {
  Alpha: "#E8252B",
  Bravo: "#3FA9F5",
  Charlie: "#52D726",
  Delta: "#F28C28",
  Echo: "#A937F2",
};

function fmtTime(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(h > 0 ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtClock(ms: number): string {
  return fmtTime(ms);
}

export function BigScreenClient({
  eventId,
  distanceFilter,
  divisionFilter,
  rotateSeconds,
}: {
  eventId: string;
  distanceFilter: string | null;
  divisionFilter: string | null;
  rotateSeconds: number;
}) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [denied, setDenied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const seenFinishersRef = useRef<Set<string> | null>(null);
  const [popQueue, setPopQueue] = useState<LiveFinisher[]>([]);
  const [activePop, setActivePop] = useState<LiveFinisher | null>(null);
  const popHideTimerRef = useRef<number | null>(null);
  const [rotateIndex, setRotateIndex] = useState(0);

  // ---- polling -------------------------------------------------------------
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/big-screen`, { cache: "no-store" });
      if (res.status === 403) {
        setDenied(true);
        return;
      }
      if (!res.ok) return;
      const json = (await res.json()) as Feed & { ok: boolean; server_ms: number };
      if (!json.ok) return;
      setDenied(false);
      setServerOffsetMs(json.server_ms - Date.now());

      // Celebration pops: any finisher we haven't seen yet.
      if (seenFinishersRef.current === null) {
        seenFinishersRef.current = new Set(json.live_finishers.map((f) => f.entry_id));
      } else {
        const seen = seenFinishersRef.current;
        const fresh = json.live_finishers
          .filter((f) => !seen.has(f.entry_id))
          .sort((a, b) => a.time_ms - b.time_ms);
        for (const f of fresh) seen.add(f.entry_id);
        if (fresh.length > 0) setPopQueue((q) => [...q, ...fresh]);
      }
      setFeed(json);
    } catch {
      // keep last frame
    }
  }, [eventId]);

  useEffect(() => {
    const initial = window.setTimeout(() => void poll(), 0);
    const t = window.setInterval(() => void poll(), POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 100);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(t);
      window.clearInterval(tick);
    };
  }, [poll]);

  // Keep the TV awake.
  useEffect(() => {
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
    return () => void lock?.release().catch(() => undefined);
  }, []);

  // ---- celebration pop queue --------------------------------------------------
  useEffect(() => {
    if (activePop || popQueue.length === 0) return;
    const [next, ...rest] = popQueue;
    const start = window.setTimeout(() => {
      setActivePop(next);
      setPopQueue(rest);
      popHideTimerRef.current = window.setTimeout(() => {
        popHideTimerRef.current = null;
        setActivePop(null);
      }, POP_MS);
    }, 0);
    return () => window.clearTimeout(start);
  }, [activePop, popQueue]);

  useEffect(
    () => () => {
      if (popHideTimerRef.current !== null) window.clearTimeout(popHideTimerRef.current);
    },
    [],
  );

  // ---- rotation -----------------------------------------------------------------
  useEffect(() => {
    if (rotateSeconds <= 0) return;
    const t = window.setInterval(() => setRotateIndex((i) => i + 1), rotateSeconds * 1000);
    return () => window.clearInterval(t);
  }, [rotateSeconds]);

  const serverNow = now + serverOffsetMs;

  const distances = useMemo(() => {
    const all = feed?.distances ?? [];
    return distanceFilter ? all.filter((d) => d.id === distanceFilter) : all;
  }, [feed, distanceFilter]);

  // Countdown takeover: nearest future gun within 60s.
  const countdown = (() => {
    for (const d of distances) {
      if (d.gun_at_ms !== null && d.gun_at_ms > serverNow && d.gun_at_ms - serverNow < 60_000) {
        return { distance: d, msLeft: d.gun_at_ms - serverNow };
      }
      // GO! flash for 4s after the gun.
      if (d.gun_at_ms !== null && serverNow - d.gun_at_ms >= 0 && serverNow - d.gun_at_ms < 4000) {
        return { distance: d, msLeft: 0 };
      }
    }
    return null;
  })();

  if (denied) {
    return (
      <Shell>
        <div className="flex h-full flex-col items-center justify-center px-10 text-center">
          <p className="text-4xl font-black">Peer Racing</p>
          <p className="mt-6 text-2xl text-white/70">
            This live board isn&apos;t public yet — the race director can flip it on from Race Control.
          </p>
        </div>
      </Shell>
    );
  }

  if (!feed) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center">
          <p className="animate-pulse text-3xl font-bold text-white/60">Loading…</p>
        </div>
      </Shell>
    );
  }

  // ---- countdown takeover ---------------------------------------------------------
  if (countdown) {
    const secs = Math.ceil(countdown.msLeft / 1000);
    return (
      <Shell>
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <p className="text-4xl font-bold uppercase tracking-widest text-white/80">{feed.event_name}</p>
          <p className="mt-4 text-6xl font-black text-[#E87722]">{countdown.distance.label}</p>
          {secs > 0 ? (
            <p
              key={secs}
              className="big-pop mt-10 font-black tabular-nums text-white"
              style={{ fontSize: secs <= 3 ? "22rem" : "16rem", lineHeight: 1 }}
            >
              {secs}
            </p>
          ) : (
            <p className="big-pop mt-10 font-black text-[#52D726]" style={{ fontSize: "11rem", lineHeight: 1.05 }}>
              GO!
              <br />
              GO!
              <br />
              GO!
            </p>
          )}
        </div>
      </Shell>
    );
  }

  // ---- celebration pop --------------------------------------------------------------
  if (activePop) {
    const dist = feed.distances.find((d) => d.id === activePop.distance_id);
    return (
      <Shell>
        <div className="big-pop flex h-full flex-col items-center justify-center px-8 text-center">
          <p className="text-6xl">🎉</p>
          <p className="mt-8 text-5xl font-bold uppercase tracking-widest text-white/80">Congrats</p>
          <p className="mt-6 break-words text-8xl font-black leading-tight text-[#E87722]">
            {activePop.name}
          </p>
          {activePop.bib ? (
            <p className="mt-4 text-4xl font-bold text-white/60">#{activePop.bib}</p>
          ) : null}
          <p className="mt-10 text-7xl font-black tabular-nums text-white">
            {activePop.time_display ?? fmtTime(activePop.time_ms)}
          </p>
          {dist ? <p className="mt-4 text-4xl font-bold text-white/70">{dist.label}</p> : null}
        </div>
      </Shell>
    );
  }

  // ---- main board ---------------------------------------------------------------------
  const visibleDistances =
    rotateSeconds > 0 && distances.length > 0
      ? [distances[rotateIndex % distances.length]]
      : distances;

  return (
    <Shell>
      <header className="border-b-4 border-[#E87722] px-8 py-6 text-center">
        <p className="text-5xl font-black uppercase tracking-tight">{feed.event_name}</p>
        <p className="mt-2 text-2xl font-semibold text-white/60">
          {feed.distances.some((d) => d.published) ? "Official Results" : "Live Results · Peer Racing"}
        </p>
      </header>

      <div className="flex-1 overflow-hidden">
        {visibleDistances.map((d) => (
          <DistanceBoard
            key={d.id}
            distance={d}
            serverNow={serverNow}
            roster={feed.roster.filter((r) => r.distance_id === d.id)}
            live={feed.live_finishers.filter((f) => f.distance_id === d.id)}
            official={feed.official_results.filter(
              (r) =>
                r.distance_id === d.id &&
                (!divisionFilter || (r.division ?? "").toLowerCase() === divisionFilter.toLowerCase()),
            )}
            divisionFilter={divisionFilter}
          />
        ))}
      </div>

      <footer className="border-t border-white/15 px-8 py-4 text-center text-xl font-semibold text-white/45">
        Results powered by Peer Racing
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[#071B2E] font-sans text-white">
      <style>{`
        @keyframes bigPop { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .big-pop { animation: bigPop 0.45s cubic-bezier(0.18, 1.4, 0.4, 1) both; }
        @keyframes boardScroll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
        .board-scroll { animation: boardScroll var(--scroll-s, 40s) linear infinite; }
      `}</style>
      {children}
    </div>
  );
}

function DistanceBoard({
  distance,
  serverNow,
  roster,
  live,
  official,
  divisionFilter,
}: {
  distance: Distance;
  serverNow: number;
  roster: { name: string; bib: string | null }[];
  live: LiveFinisher[];
  official: OfficialRow[];
  divisionFilter: string | null;
}) {
  const running = distance.gun_at_ms !== null && distance.gun_at_ms <= serverNow;
  const stopped = running && distance.stopped_at_ms !== null;

  return (
    <section className="px-8 py-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-4xl font-black uppercase text-[#E87722]">
          {distance.label}
          {divisionFilter ? <span className="ml-3 text-white/70">· {divisionFilter}</span> : null}
        </h2>
        {running && !distance.published ? (
          <span className="font-mono text-4xl font-black tabular-nums text-white/85">
            {stopped
              ? fmtClock(Math.max(0, (distance.stopped_at_ms as number) - (distance.gun_at_ms as number)))
              : fmtClock(serverNow - (distance.gun_at_ms as number))}
            {stopped ? (
              <span className="ml-3 align-middle text-lg font-bold uppercase tracking-widest text-emerald-400">
                Final
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {distance.published ? (
        <OfficialList rows={official} />
      ) : live.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {live.slice(0, 14).map((f, i) => (
            <li key={f.entry_id} className="flex items-center gap-4 rounded-lg bg-white/5 px-4 py-2.5">
              <span className="w-14 text-3xl font-black tabular-nums text-[#E87722]">{i + 1}</span>
              <span className="flex-1 truncate text-3xl font-bold">{f.name}</span>
              {f.bib ? <span className="text-2xl font-semibold text-white/50">#{f.bib}</span> : null}
              <span className="font-mono text-3xl font-black tabular-nums">
                {f.time_display ?? fmtTime(f.time_ms)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <RosterScroll roster={roster} />
      )}
    </section>
  );
}

function OfficialList({ rows }: { rows: OfficialRow[] }) {
  if (rows.length === 0) {
    return <p className="mt-6 text-2xl text-white/50">Results coming up…</p>;
  }
  return (
    <ul className="mt-4 space-y-2">
      {rows.slice(0, 14).map((r) => (
        <li
          key={`${r.distance_id}-${r.overall_rank}-${r.name}`}
          className="flex items-center gap-4 rounded-lg bg-white/5 px-4 py-2.5"
        >
          <span className="w-14 text-3xl font-black tabular-nums text-[#E87722]">
            {r.overall_rank ?? "—"}
          </span>
          <span className="flex-1 truncate text-3xl font-bold">{r.name}</span>
          {r.division ? (
            <span
              className="rounded-full px-3 py-1 text-xl font-black uppercase"
              style={{ backgroundColor: DIVISION_COLORS[r.division] ?? "#F26822", color: "#071B2E" }}
            >
              {r.division}
              {r.division_place ? ` ${r.division_place}` : ""}
            </span>
          ) : null}
          {typeof r.payout_cents === "number" && r.payout_cents > 0 ? (
            <span className="text-2xl font-black text-[#52D726]">
              ${(r.payout_cents / 100).toFixed(0)}
            </span>
          ) : null}
          <span className="font-mono text-3xl font-black tabular-nums">{fmtTime(r.finish_time_ms)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Pre-race: every entrant's name drifts up the screen on a loop. */
function RosterScroll({ roster }: { roster: { name: string; bib: string | null }[] }) {
  if (roster.length === 0) {
    return <p className="mt-6 text-2xl text-white/50">No entrants yet.</p>;
  }
  const doubled = [...roster, ...roster];
  const scrollSeconds = Math.max(20, roster.length * 2);
  return (
    <div className="relative mt-4 h-[52vh] overflow-hidden">
      <div className="board-scroll" style={{ "--scroll-s": `${scrollSeconds}s` } as React.CSSProperties}>
        {doubled.map((r, i) => (
          <p key={i} className="py-2 text-center text-3xl font-bold text-white/85">
            {r.name}
            {r.bib ? <span className="ml-3 text-2xl font-semibold text-white/45">#{r.bib}</span> : null}
          </p>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#071B2E] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#071B2E] to-transparent" />
    </div>
  );
}
