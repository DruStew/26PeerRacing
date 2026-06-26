"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PaidTierOption = {
  slug: string;
  display_name: string;
  price_usd: number;
  checkout_enabled: boolean;
};

export function RenewMembershipForm({
  returnUrl,
  currentTier,
  paidTiers,
  showDevFree,
}: {
  returnUrl?: string | null;
  currentTier: string;
  paidTiers: PaidTierOption[];
  showDevFree: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const currentRank = paidTiers.findIndex((t) => t.slug === currentTier);
  const enabledTiers = paidTiers.filter((t) => t.checkout_enabled);

  const startCheckout = async (tier: string) => {
    setStatus("loading");
    setError(null);

    const res = await fetch("/api/membership/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl: returnUrl ?? null, tier }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!res.ok || !data.url) {
      setStatus("error");
      setError(data.error ?? "Could not start checkout");
      return;
    }
    window.location.assign(data.url);
  };

  const handleDevFreeRenew = async () => {
    setStatus("loading");
    setError(null);
    const res = await fetch("/api/membership/renew", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus("error");
      setError((data as { error?: string }).error ?? "Renewal failed");
      return;
    }
    router.push(
      returnUrl ? `/membership/renewed?returnUrl=${encodeURIComponent(returnUrl)}` : "/membership/renewed",
    );
    router.refresh();
  };

  return (
    <div className="space-y-4">
      {currentTier === "free" ? (
        <p className="text-sm text-[#1E3A5F]/75">
          You&apos;re on the <strong>Free</strong> tier. Upgrade to enter most Peer Racing events —
          subscriptions renew automatically each year.
        </p>
      ) : (
        <p className="text-sm text-[#1E3A5F]/75">
          You&apos;re on a paid membership tier. Upgrade to a higher tier for premium-only races.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {enabledTiers.map((t) => {
          const tierIndex = paidTiers.findIndex((p) => p.slug === t.slug);
          const isCurrent = t.slug === currentTier;
          const isDowngrade = currentRank >= 0 && tierIndex >= 0 && tierIndex < currentRank;
          if (isDowngrade) return null;

          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => void startCheckout(t.slug)}
              disabled={status === "loading" || isCurrent}
              className={`inline-flex flex-1 items-center justify-center rounded-md px-5 py-3 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[200px] ${
                t.slug === "top_tier"
                  ? "border border-[#1E3A5F]/25 bg-white text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
                  : "bg-[#E87722] text-white hover:bg-[#E87722]/90"
              }`}
            >
              {status === "loading"
                ? "Redirecting…"
                : isCurrent
                  ? `${t.display_name} active`
                  : `Join ${t.display_name} — $${t.price_usd}/yr`}
            </button>
          );
        })}
        {showDevFree ? (
          <button
            type="button"
            onClick={() => void handleDevFreeRenew()}
            disabled={status === "loading"}
            className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white"
          >
            {status === "loading" ? "Renewing…" : "Renew membership (dev — no Stripe)"}
          </button>
        ) : null}
      </div>

      {status === "error" && error ? (
        <div
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
