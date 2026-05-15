"use client";

import { useCallback, useEffect, useState } from "react";

type TerminalRow = {
  id: string;
  label: string;
  status: "green" | "yellow" | "red";
  signedOff: boolean;
  lastHeartbeatAt: string;
};

type Payload = {
  ok: boolean;
  eventName?: string;
  timezone?: string;
  codesForLocalDate?: string;
  generationVersion?: number;
  kioskCode?: string;
  authCode?: string;
  terminals?: TerminalRow[];
  error?: string;
};

function buildKioskTabletUrl(baseUrl: string, eventId: string): string {
  if (baseUrl) return `${baseUrl.replace(/\/$/, "")}/kiosk/${eventId}`;
  if (typeof window !== "undefined") return `${window.location.origin}/kiosk/${eventId}`;
  return `/kiosk/${eventId}`;
}

export function PromoterKioskClient({ eventId, baseUrl }: { eventId: string; baseUrl: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [regenPending, setRegenPending] = useState(false);
  const [copyDone, setCopyDone] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/promoter/events/${eventId}/kiosk`);
    const json = (await res.json()) as Payload;
    setData(json);
  }, [eventId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function regenerate() {
    if (!window.confirm("Regenerate kiosk and authorization codes? All tablets must enter the new codes.")) {
      return;
    }
    setRegenPending(true);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/kiosk`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        alert(json.error ?? "Failed");
        return;
      }
      await load();
    } finally {
      setRegenPending(false);
    }
  }

  if (!data?.ok) {
    return (
      <p className="mt-8 text-sm text-red-700">
        {data?.error ?? "Loading…"} (Set EVENT_KIOSK_SECRET and apply the event_kiosk migration if this persists.)
      </p>
    );
  }

  return (
    <div className="mt-10 space-y-10">
      <section className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-6">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Today&apos;s Codes</h2>
        <p className="mt-1 text-xs text-[#1E3A5F]/60">
          Local date {data.codesForLocalDate} ({data.timezone}) · version {data.generationVersion}. New codes each
          calendar day in the event timezone; you can regenerate anytime if compromised.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/55">Kiosk (floor)</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-[#1E3A5F]">{data.kioskCode}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#1E3A5F]/55">Authorization (Refunds / Money)</p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-[#1E3A5F]">{data.authCode}</p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-[#1E3A5F]/12 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">Kiosk Link for Tablets</p>
          <p className="mt-1 text-xs text-[#1E3A5F]/65">Share this URL on race-day devices (then enter the kiosk code above).</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <code className="block min-w-0 flex-1 break-all rounded border border-[#1E3A5F]/15 bg-[#fafbfc] px-3 py-2 font-mono text-xs text-[#1E3A5F]">
              {buildKioskTabletUrl(baseUrl, eventId)}
            </code>
            <button
              type="button"
              onClick={() => {
                const url = buildKioskTabletUrl(baseUrl, eventId);
                void navigator.clipboard.writeText(url).then(() => {
                  setCopyDone(true);
                  window.setTimeout(() => setCopyDone(false), 2000);
                });
              }}
              className="shrink-0 rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
            >
              {copyDone ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={regenPending}
          onClick={() => void regenerate()}
          className="mt-6 rounded-md border border-[#1E3A5F]/25 px-4 py-2 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722] disabled:opacity-50"
        >
          {regenPending ? "Regenerating…" : "Regenerate codes now"}
        </button>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Terminals</h2>
        <p className="mt-1 text-sm text-[#1E3A5F]/70">
          Green = active, yellow = idle 5+ min, red = signed off.
        </p>
        <ul className="mt-4 divide-y divide-[#1E3A5F]/10 rounded-xl border border-[#1E3A5F]/10 bg-white">
          {(data.terminals ?? []).length === 0 ? (
            <li className="px-4 py-6 text-sm text-[#1E3A5F]/65">No tablets have signed in yet.</li>
          ) : (
            data.terminals!.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      t.status === "green" ? "#16a34a" : t.status === "yellow" ? "#ca8a04" : "#dc2626",
                  }}
                  title={t.status}
                />
                <span className="font-medium text-[#1E3A5F]">{t.label}</span>
                <span className="text-xs text-[#1E3A5F]/55">
                  {t.signedOff ? "Signed off" : `Last seen ${new Date(t.lastHeartbeatAt).toLocaleTimeString()}`}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
