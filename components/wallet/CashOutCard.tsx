"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { formatUsdFromCents } from "@/lib/wallet/format-money";

/**
 * Wallet cash-out: Stripe Express onboarding on first use, then amount →
 * fee → net confirmation and a one-click transfer to their bank.
 */

type RequestDisplay = {
  id: string;
  amount_cents: number;
  fee_cents: number;
  net_cents: number;
  method: "stripe" | "manual";
  status: "pending" | "paid" | "canceled" | "failed";
  manual_method: string | null;
  requested_at: string;
  paid_at: string | null;
};

const STATUS_BADGE: Record<RequestDisplay["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  canceled: "bg-[#1E3A5F]/10 text-[#1E3A5F]/70",
  failed: "bg-red-100 text-red-800",
};

export function CashOutCard({
  balanceCents,
  minCents,
  feeCents,
  payoutsEnabled,
  onboardingStarted,
  requests,
}: {
  balanceCents: number;
  minCents: number;
  feeCents: number;
  payoutsEnabled: boolean;
  /** Connect account exists but Stripe onboarding isn't finished. */
  onboardingStarted: boolean;
  requests: RequestDisplay[];
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const amountCents = useMemo(() => {
    const n = parseFloat(amount.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 100);
  }, [amount]);
  const netCents = amountCents - feeCents;

  async function startOnboarding() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/connect/onboard", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!json.ok || !json.url) {
        setError(json.error ?? "Could not start payout setup.");
        return;
      }
      window.location.assign(json.url);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  async function requestPayout() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/wallet/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_cents: amountCents }),
      });
      const json = (await res.json()) as { ok: boolean; net_cents?: number; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Cash-out failed.");
        return;
      }
      setAmount("");
      setNotice(
        `${formatUsdFromCents(json.net_cents ?? netCents)} is on its way to your bank (arrives in ~2 business days).`,
      );
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const canRequest =
    payoutsEnabled && amountCents >= minCents && amountCents <= balanceCents && !busy;

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">Cash Out</h2>

      <div className="mt-4 rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
        {!payoutsEnabled ? (
          <div>
            <p className="text-sm leading-relaxed text-[#1E3A5F]/80">
              {onboardingStarted
                ? "Your payout setup isn't finished yet. Pick up where you left off — Stripe needs your identity and bank details before money can move."
                : "Transfer winnings straight to your bank. One-time setup through Stripe (our payments partner): identity and bank details, about two minutes. Your info goes to Stripe, not Peer Racing."}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startOnboarding()}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:opacity-60"
            >
              {busy ? "Opening…" : onboardingStarted ? "Continue payout setup" : "Set up payouts"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-sm text-[#1E3A5F]/80">
              Payouts are set up. Standard transfers arrive in about 2 business days.{" "}
              <span className="font-medium">
                {formatUsdFromCents(feeCents)} flat fee per cash-out
              </span>{" "}
              — spending your wallet on race entries is always free.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#1E3A5F]/50">
                  $
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-40 rounded-lg border border-[#1E3A5F]/20 bg-white py-2.5 pl-7 pr-3 text-sm tabular-nums text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
                />
              </div>
              <button
                type="button"
                onClick={() => setAmount((balanceCents / 100).toFixed(2))}
                className="text-left text-xs font-semibold text-[#E87722] hover:underline sm:text-sm"
              >
                Cash out full balance ({formatUsdFromCents(balanceCents)})
              </button>
            </div>

            {amountCents > 0 ? (
              <p className="mt-3 text-sm tabular-nums text-[#1E3A5F]/75">
                {formatUsdFromCents(amountCents)} from wallet − {formatUsdFromCents(feeCents)} fee ={" "}
                <span className="font-semibold text-[#1E3A5F]">
                  {formatUsdFromCents(Math.max(0, netCents))} to your bank
                </span>
                {amountCents < minCents ? (
                  <span className="ml-2 text-red-700">
                    (minimum {formatUsdFromCents(minCents)})
                  </span>
                ) : amountCents > balanceCents ? (
                  <span className="ml-2 text-red-700">(more than your balance)</span>
                ) : null}
              </p>
            ) : null}

            <button
              type="button"
              disabled={!canRequest}
              onClick={() => void requestPayout()}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Sending…" : "Transfer to my bank"}
            </button>
          </div>
        )}

        {error ? <p className="mt-3 text-sm font-medium text-red-600">{error}</p> : null}
        {notice ? <p className="mt-3 text-sm font-medium text-emerald-700">{notice}</p> : null}
      </div>

      {requests.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-[#1E3A5F]/80">Cash-out history</h3>
          <ul className="mt-2 divide-y divide-[#1E3A5F]/10 rounded-xl border border-[#1E3A5F]/10 bg-white">
            {requests.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-[#1E3A5F]">
                    {formatUsdFromCents(r.net_cents)}{" "}
                    <span className="text-[#1E3A5F]/55">
                      {r.method === "manual"
                        ? `· paid ${String(r.manual_method ?? "manually").replace("_", " ")}`
                        : "· to bank"}
                    </span>
                  </p>
                  <p className="text-xs text-[#1E3A5F]/55">
                    {new Date(r.requested_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {r.fee_cents > 0 ? ` · ${formatUsdFromCents(r.fee_cents)} fee` : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
