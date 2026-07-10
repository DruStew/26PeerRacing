"use client";

import QRCode from "qrcode";
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

/**
 * One shareable race-day link: URL carries the kiosk code (?code=) and the
 * destination (?next=), so the recipient just opens it and taps Continue.
 * Share sheet on mobile, copy everywhere, QR for handing to a device in
 * person. Codes rotate daily and can be regenerated, same as before.
 */
function ShareLinkRow({
  title,
  desc,
  url,
  shareText,
}: {
  title: string;
  desc: string;
  url: string;
  shareText: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function share() {
    try {
      await navigator.share({ title, text: shareText, url });
    } catch {
      // user canceled — nothing to do
    }
  }

  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  async function toggleQr() {
    if (!qrOpen && !qrDataUrl) {
      try {
        setQrDataUrl(await QRCode.toDataURL(url, { width: 480, margin: 1 }));
      } catch {
        return;
      }
    }
    setQrOpen((o) => !o);
  }

  return (
    <div className="rounded-lg border border-[#1E3A5F]/12 bg-white/80 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1E3A5F]">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[#1E3A5F]/60">{desc}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canShare ? (
            <button
              type="button"
              onClick={() => void share()}
              className="rounded-md bg-[#E87722] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#E87722]/90"
            >
              Share
            </button>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className={
              canShare
                ? "rounded-md border border-[#1E3A5F]/25 px-3.5 py-2 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722]"
                : "rounded-md bg-[#E87722] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#E87722]/90"
            }
          >
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={() => void toggleQr()}
            className="rounded-md border border-[#1E3A5F]/25 px-3.5 py-2 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722]"
          >
            {qrOpen ? "Hide QR" : "QR"}
          </button>
        </div>
      </div>
      {qrOpen && qrDataUrl ? (
        <div className="mt-3 flex flex-col items-center gap-1 rounded-lg bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt={`QR code for ${title}`} className="h-56 w-56" />
          <p className="text-center text-xs text-[#1E3A5F]/60">
            Scan with the device&apos;s camera — code is pre-filled, just tap Continue.
          </p>
        </div>
      ) : null}
    </div>
  );
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

        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#1E3A5F]/55">
            Share Race-Day Links
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#1E3A5F]/65">
            Each link carries today&apos;s kiosk code — the person just opens it and taps Continue.
            Text it, share it, or have them scan the QR. Regenerating codes kills old links.
          </p>
          <div className="mt-3 space-y-3">
            <ShareLinkRow
              title="Check-In Desk"
              desc="Tablets and phones working the check-in table."
              url={`${primaryKioskUrl}?code=${data.kioskCode ?? ""}`}
              shareText={`${data.eventName ?? "Race"} — check-in desk. Open this link and tap Continue.`}
            />
            <ShareLinkRow
              title="Finish Cam"
              desc="The phone on the tripod at the finish line."
              url={`${primaryKioskUrl}?code=${data.kioskCode ?? ""}&next=${encodeURIComponent(`/events/${eventId}/finish-cam`)}`}
              shareText={`${data.eventName ?? "Race"} — finish camera. Open this link on the tripod phone and tap Continue.`}
            />
            <ShareLinkRow
              title="Race Control"
              desc="The finish-line laptop: guns, MARK, confirm times."
              url={`${primaryKioskUrl}?code=${data.kioskCode ?? ""}&next=${encodeURIComponent(`/events/${eventId}/race-control`)}`}
              shareText={`${data.eventName ?? "Race"} — race control. Open this link on the laptop and tap Continue.`}
            />
          </div>
          <button
            type="button"
            onClick={() => setTroubleshootOpen(true)}
            className="mt-3 text-xs font-semibold text-[#E87722] underline-offset-2 hover:underline"
          >
            If race-day devices can&apos;t connect
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
