"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RenewMembershipForm({
  paidCheckoutEnabled,
  returnUrl,
}: {
  paidCheckoutEnabled: boolean;
  returnUrl?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleRenew = async () => {
    setStatus("loading");
    setError(null);

    if (paidCheckoutEnabled) {
      const res = await fetch("/api/membership/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: returnUrl ?? null }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
      if (!res.ok || !data.url) {
        setStatus("error");
        setError(data.error ?? "Could not start checkout");
        return;
      }
      window.location.assign(data.url);
      return;
    }

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

  const buttonLabel = paidCheckoutEnabled
    ? status === "loading"
      ? "Redirecting…"
      : "Pay and renew membership"
    : status === "loading"
      ? "Renewing…"
      : "Renew membership (free)";

  return (
    <div>
      <button
        type="button"
        onClick={handleRenew}
        disabled={status === "loading"}
        className="inline-flex w-full items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[200px]"
      >
        {buttonLabel}
      </button>
      {status === "error" && error ? (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
