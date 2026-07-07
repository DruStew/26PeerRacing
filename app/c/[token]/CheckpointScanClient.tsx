"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runner-facing checkpoint page. Priorities: works one-handed while sweaty and
 * moving — a single huge bib field (remembered per event), instant ping, and a
 * big play button for the audio story.
 */

function deviceId(): string {
  const KEY = "pr_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

type Props = {
  token: string;
  eventId: string;
  eventName: string;
  distanceLabel: string;
  checkpointNumber: number;
  checkpointName: string;
  mileMarker: string | null;
  audioUrl: string | null;
  knownBib: string | null;
  knownName: string | null;
};

type ScanState =
  | { phase: "ask-bib" }
  | { phase: "sending" }
  | { phase: "done"; matched: boolean; runnerName: string | null; anonymous: boolean }
  | { phase: "error"; message: string };

export function CheckpointScanClient(props: Props) {
  const [state, setState] = useState<ScanState>({ phase: "sending" });
  const [bibInput, setBibInput] = useState("");
  const startedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const bibStorageKey = `pr_cp_bib_${props.eventId}`;

  const sendScan = useCallback(
    async (bib: string | null, anonymous: boolean) => {
      setState({ phase: "sending" });
      try {
        const res = await fetch("/api/checkpoint-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: props.token,
            deviceId: deviceId(),
            bib: bib ?? undefined,
          }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          matched?: boolean;
          runnerName?: string | null;
        };
        if (!json.ok) {
          setState({ phase: "error", message: json.error ?? "Something went wrong." });
          return;
        }
        if (bib) localStorage.setItem(bibStorageKey, bib);
        setState({
          phase: "done",
          matched: json.matched === true,
          runnerName: json.runnerName ?? null,
          anonymous,
        });
      } catch {
        setState({
          phase: "error",
          message: "No signal — your scan could not be sent. Try again when you have service.",
        });
      }
    },
    [props.token, bibStorageKey],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const remembered = props.knownBib ?? localStorage.getItem(bibStorageKey);
    if (remembered) {
      void sendScan(remembered, false);
    } else {
      setState({ phase: "ask-bib" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-[#002F48] px-5 py-8 text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-white/60">
          Peer Racing checkpoint
        </p>
        <h1 className="mt-3 text-center text-3xl font-bold leading-tight">
          {props.checkpointName}
        </h1>
        <p className="mt-2 text-center text-sm text-white/70">
          Checkpoint {props.checkpointNumber}
          {props.mileMarker ? ` · Mile ${props.mileMarker}` : ""} · {props.distanceLabel}
        </p>
        <p className="mt-1 text-center text-sm font-medium text-[#F26822]">{props.eventName}</p>

        <div className="mt-8 flex-1">
          {state.phase === "ask-bib" ? (
            <form
              className="rounded-2xl bg-white p-6 text-[#002F48]"
              onSubmit={(e) => {
                e.preventDefault();
                const bib = bibInput.trim();
                if (bib) void sendScan(bib, false);
              }}
            >
              <label htmlFor="bib" className="block text-center text-lg font-bold">
                What&apos;s your bib number?
              </label>
              <input
                id="bib"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={bibInput}
                onChange={(e) => setBibInput(e.target.value)}
                placeholder="123"
                className="mt-4 w-full rounded-xl border-2 border-[#002F48]/20 px-4 py-5 text-center text-5xl font-bold tracking-widest text-[#002F48] placeholder:text-[#002F48]/25 focus:border-[#F26822] focus:outline-none"
              />
              <p className="mt-2 text-center text-xs text-[#002F48]/55">
                One time only — we&apos;ll remember you at every checkpoint today.
              </p>
              <button
                type="submit"
                disabled={!bibInput.trim()}
                className="mt-4 w-full rounded-xl bg-[#F26822] py-5 text-xl font-bold text-white disabled:opacity-40"
              >
                Check in here
              </button>
              <button
                type="button"
                onClick={() => void sendScan(null, true)}
                className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-[#002F48]/60"
              >
                Just visiting — no bib
              </button>
            </form>
          ) : null}

          {state.phase === "sending" ? (
            <div className="rounded-2xl bg-white/10 p-8 text-center">
              <p className="text-lg font-semibold">Checking you in…</p>
            </div>
          ) : null}

          {state.phase === "done" ? (
            <div className="rounded-2xl bg-white p-6 text-center text-[#002F48]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-9 w-9 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="mt-4 text-2xl font-bold">
                {state.anonymous ? "Scan counted!" : "You're on the board!"}
              </p>
              {state.runnerName ? (
                <p className="mt-1 text-base font-medium text-[#002F48]/75">{state.runnerName}</p>
              ) : props.knownName ? (
                <p className="mt-1 text-base font-medium text-[#002F48]/75">{props.knownName}</p>
              ) : !state.anonymous && !state.matched ? (
                <p className="mt-1 text-sm text-amber-700">
                  We logged your scan, but that bib didn&apos;t match the roster — double-check it
                  with the crew at the next aid station.
                </p>
              ) : null}
              <p className="mt-2 text-sm text-[#002F48]/60">
                {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ·{" "}
                {props.checkpointName}
              </p>
            </div>
          ) : null}

          {state.phase === "error" ? (
            <div className="rounded-2xl bg-white p-6 text-center text-[#002F48]">
              <p className="text-lg font-bold text-red-600">Scan not sent</p>
              <p className="mt-2 text-sm text-[#002F48]/70">{state.message}</p>
              <button
                type="button"
                onClick={() => {
                  const remembered = props.knownBib ?? localStorage.getItem(bibStorageKey);
                  if (remembered) void sendScan(remembered, false);
                  else setState({ phase: "ask-bib" });
                }}
                className="mt-4 w-full rounded-xl bg-[#F26822] py-4 text-lg font-bold text-white"
              >
                Try again
              </button>
            </div>
          ) : null}

          {props.audioUrl && (state.phase === "done" || state.phase === "error") ? (
            <div className="mt-6 rounded-2xl bg-white/10 p-5 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-white/70">
                The story of this spot
              </p>
              <button
                type="button"
                onClick={togglePlay}
                className="mt-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#F26822] shadow-lg"
                aria-label={playing ? "Pause story" : "Play story"}
              >
                {playing ? (
                  <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg className="ml-1 h-9 w-9 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5.14v13.72c0 .8.87 1.3 1.57.9l10.4-6.86a1.05 1.05 0 000-1.8L9.57 4.24A1.05 1.05 0 008 5.14z" />
                  </svg>
                )}
              </button>
              <audio
                ref={audioRef}
                src={props.audioUrl}
                preload="none"
                onEnded={() => setPlaying(false)}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                className="mt-4 w-full"
                controls
              />
            </div>
          ) : null}
        </div>

        <p className="mt-8 text-center text-xs text-white/40">peerracing.com</p>
      </div>
    </main>
  );
}
