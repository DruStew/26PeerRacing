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

/** Windows mobile hotspot: clients reach the host PC at this address. */
function hotspotDevBaseUrl(primaryBase: string): string {
  try {
    const u = new URL(primaryBase);
    const port = u.port || (u.protocol === "https:" ? "443" : "80");
    const showPort =
      (u.protocol === "http:" && port !== "80") || (u.protocol === "https:" && port !== "443");
    return `http://192.168.137.1${showPort ? `:${port}` : ""}`;
  } catch {
    return "http://192.168.137.1:3000";
  }
}

export function PromoterKioskClient({
  eventId,
  baseUrl,
  baseUrls,
}: {
  eventId: string;
  baseUrl: string;
  baseUrls?: string[];
}) {
  const shareBaseUrls = baseUrls?.length ? baseUrls : baseUrl ? [baseUrl] : [];
  const primaryBase = shareBaseUrls[0] ?? baseUrl;
  const [data, setData] = useState<Payload | null>(null);
  const [regenPending, setRegenPending] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);

  const primaryKioskUrl = buildKioskTabletUrl(primaryBase, eventId);
  const hotspotKioskUrl = buildKioskTabletUrl(hotspotDevBaseUrl(primaryBase), eventId);

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
          <p className="mt-1 text-xs leading-relaxed text-[#1E3A5F]/65">
            Share this URL on race-day devices on the <strong>same Wi‑Fi</strong> (not cellular). Use{" "}
            <strong>http</strong> and include <strong>:3000</strong> while developing locally.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <code className="block min-w-0 flex-1 break-all rounded border border-[#1E3A5F]/15 bg-[#fafbfc] px-3 py-2 font-mono text-xs text-[#1E3A5F]">
              {primaryKioskUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(primaryKioskUrl).then(() => {
                  setCopyDone(true);
                  window.setTimeout(() => setCopyDone(false), 2000);
                });
              }}
              className="shrink-0 rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
            >
              {copyDone ? "Copied!" : "Copy link"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTroubleshootOpen(true)}
            className="mt-3 text-xs font-semibold text-[#E87722] underline-offset-2 hover:underline"
          >
            If slave devices can&apos;t connect
          </button>
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

      {troubleshootOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E3A5F]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kiosk-troubleshoot-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTroubleshootOpen(false);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#1E3A5F]/10 bg-white p-6 shadow-2xl">
            <h2 id="kiosk-troubleshoot-title" className="font-display text-lg font-semibold text-[#1E3A5F]">
              If Slave Devices Can&apos;t Connect
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#1E3A5F]/80">
              <p>
                Alternate:{" "}
                <code className="break-all font-mono text-xs text-[#1E3A5F]">{hotspotKioskUrl}</code>
              </p>
              <p className="text-xs text-[#1E3A5F]/65">
                Turn on this PC&apos;s mobile hotspot and connect tablets/phones to it when your router blocks
                device-to-device traffic.
              </p>
              <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-[#1E3A5F]/75">
                <li>Phone must be on Wi‑Fi — turn off cellular or use airplane mode + Wi‑Fi only.</li>
                <li>
                  If the link still fails, run{" "}
                  <code className="font-mono text-[11px]">scripts/allow-dev-lan-firewall.ps1</code> as Administrator
                  (Windows firewall).
                </li>
                <li>
                  On this PC, open{" "}
                  <code className="break-all font-mono text-[11px]">{primaryKioskUrl}</code> in a browser — if that
                  works here but not on the phone, the network is blocking device-to-device traffic.
                </li>
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setTroubleshootOpen(false)}
              className="mt-6 w-full rounded-md bg-[#E87722] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#E87722]/90"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
