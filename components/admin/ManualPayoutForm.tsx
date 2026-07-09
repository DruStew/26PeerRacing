"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin escape hatch: record a payout made outside Stripe (cash at the race,
 * Cash App, check for a minor). Debits the member's wallet immediately.
 */

const inputClass =
  "mt-1 w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

export function ManualPayoutForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash_app");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    const n = parseFloat(amount.replace(/[$,\s]/g, ""));
    const amountCents = Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
    if (!email.trim() || amountCents <= 0) {
      setError("Enter the member's email and a valid amount.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/payouts/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          amount_cents: amountCents,
          manual_method: method,
          manual_reference: reference.trim() || null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; message?: string; error?: string };
      if (!json.ok) {
        setError(json.error ?? "Could not record the payout.");
        return;
      }
      setNotice(json.message ?? "Recorded.");
      setEmail("");
      setAmount("");
      setReference("");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm">
      <h3 className="font-display text-base font-semibold text-[#1E3A5F]">
        Record a payout made outside Stripe
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-[#1E3A5F]/60">
        Cash at the race, Cash App, or a check (e.g. for a minor). This debits the member&apos;s
        wallet the exact amount you paid them — no fee. Pay from Peer Racing accounts only, never
        from your own pocket, so the books reconcile against one pool.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium text-[#1E3A5F]/70">
          Member email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="runner@example.com"
            className={inputClass}
          />
        </label>
        <label className="block text-xs font-medium text-[#1E3A5F]/70">
          Amount paid ($)
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="125.00"
            className={inputClass}
          />
        </label>
        <label className="block text-xs font-medium text-[#1E3A5F]/70">
          How
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
            <option value="cash_app">Cash App</option>
            <option value="venmo">Venmo</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-[#1E3A5F]/70">
          Reference (optional)
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Cash App 7/12, Sequoyah Four"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-md bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1E3A5F]/90 disabled:opacity-50"
        >
          {busy ? "Recording…" : "Record payout"}
        </button>
        {error ? <span className="text-sm font-medium text-red-600">{error}</span> : null}
        {notice ? <span className="text-sm font-medium text-emerald-700">{notice}</span> : null}
      </div>
    </div>
  );
}
