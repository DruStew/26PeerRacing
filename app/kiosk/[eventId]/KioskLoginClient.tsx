"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function KioskLoginClient({
  eventId,
  next,
  initialCode,
}: {
  eventId: string;
  next?: string | null;
  /** Pre-filled from a shared link (?code=) — recipient just taps Continue. */
  initialCode?: string | null;
}) {
  const router = useRouter();
  const [digits, setDigits] = useState(() => (initialCode ?? "").replace(/\D/g, "").slice(0, 6));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const code = digits.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setError("Enter all 6 digits.");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/kiosk/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, kioskCode: code, next: next ?? undefined }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; redirect?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not sign in");
        return;
      }
      if (json.redirect) {
        router.push(json.redirect);
        router.refresh();
        return;
      }
      setError("Unexpected response");
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-[#1E3A5F]">6-Digit Kiosk Code</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mt-2 w-full rounded-lg border border-[#1E3A5F]/20 px-4 py-3 text-center font-mono text-2xl tracking-[0.3em] text-[#1E3A5F] focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25"
          placeholder="000000"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-[#E87722] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
