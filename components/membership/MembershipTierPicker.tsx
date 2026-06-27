"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatTierPriceUsd } from "@/lib/membership-tier-config";
import { DEFAULT_PUBLIC_ROUTE, MEMBERSHIP_ACCOUNT_ROUTE } from "@/lib/routes";

export type MembershipTierPickerOption = {
  slug: string;
  display_name: string;
  description: string;
  price_cents: number;
  rank: number;
  is_paid: boolean;
  checkout_enabled: boolean;
};

type Props = {
  tiers: MembershipTierPickerOption[];
  /** Public browse vs signed-in account management */
  mode: "browse" | "manage";
  signedIn: boolean;
  currentTierSlug?: string | null;
  returnUrl?: string | null;
  /** Pre-select tier after sign-up (from ?tier= on renew page) */
  highlightTierSlug?: string | null;
  showDevFree?: boolean;
};

function tierButtonClass(slug: string, featured: boolean, variant: "primary" | "secondary" | "muted") {
  if (variant === "muted") {
    return "border border-[#1E3A5F]/15 bg-[#1E3A5F]/5 text-[#1E3A5F]/60 cursor-not-allowed";
  }
  if (variant === "secondary") {
    return "border border-[#1E3A5F]/25 bg-white text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]";
  }
  if (featured || slug === "top_tier") {
    return "border border-[#1E3A5F]/25 bg-white text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]";
  }
  return "bg-[#E87722] text-white hover:bg-[#E87722]/90";
}

export function MembershipTierPicker({
  tiers,
  mode,
  signedIn,
  currentTierSlug,
  returnUrl,
  highlightTierSlug,
  showDevFree,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [noticeTier, setNoticeTier] = useState<string | null>(highlightTierSlug ?? null);

  useEffect(() => {
    setNoticeTier(highlightTierSlug ?? null);
  }, [highlightTierSlug]);

  const currentRank = tiers.find((t) => t.slug === currentTierSlug)?.rank ?? -1;
  const featuredSlug =
    tiers.find((t) => t.slug === "pr_team")?.slug ??
    tiers.filter((t) => t.is_paid).sort((a, b) => a.rank - b.rank)[0]?.slug;

  const startCheckout = async (tierSlug: string) => {
    setStatus("loading");
    setError(null);

    const res = await fetch("/api/membership/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl: returnUrl ?? null, tier: tierSlug }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    if (!res.ok || !data.url) {
      setStatus("idle");
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
      setStatus("idle");
      setError((data as { error?: string }).error ?? "Renewal failed");
      return;
    }
    router.push(
      returnUrl
        ? `/membership/renewed?returnUrl=${encodeURIComponent(returnUrl)}`
        : "/membership/renewed",
    );
    router.refresh();
  };

  function loginUrlForTier(tierSlug: string): string {
    const afterLogin =
      tierSlug === "free"
        ? DEFAULT_PUBLIC_ROUTE
        : `${MEMBERSHIP_ACCOUNT_ROUTE}?tier=${encodeURIComponent(tierSlug)}`;
    return `/login?returnUrl=${encodeURIComponent(afterLogin)}`;
  }

  function renderAction(tier: MembershipTierPickerOption) {
    const isCurrent = mode === "manage" && tier.slug === currentTierSlug;
    const isDowngrade = mode === "manage" && currentRank >= 0 && tier.rank < currentRank;

    if (isDowngrade) {
      return (
        <p className="mt-5 text-sm text-[#1E3A5F]/50">
          Contact support to change to a lower tier.
        </p>
      );
    }

    if (isCurrent) {
      return (
        <span className="mt-5 inline-flex w-full items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
          Current plan
        </span>
      );
    }

    if (tier.is_paid && !tier.checkout_enabled) {
      return (
        <span className="mt-5 inline-flex w-full items-center justify-center rounded-md border border-[#1E3A5F]/15 bg-[#1E3A5F]/5 px-4 py-2.5 text-sm font-medium text-[#1E3A5F]/55">
          Checkout coming soon
        </span>
      );
    }

    if (tier.is_paid) {
      if (signedIn) {
        return (
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => void startCheckout(tier.slug)}
            className={`mt-5 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tierButtonClass(
              tier.slug,
              tier.slug === featuredSlug,
              "primary",
            )}`}
          >
            {status === "loading" ? "Redirecting…" : `Choose ${tier.display_name}`}
          </button>
        );
      }

      return (
        <Link
          href={loginUrlForTier(tier.slug)}
          className={`mt-5 inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors ${tierButtonClass(
            tier.slug,
            tier.slug === featuredSlug,
            "primary",
          )}`}
        >
          Join {tier.display_name}
        </Link>
      );
    }

    if (signedIn) {
      return (
        <Link
          href={returnUrl?.startsWith("/") ? returnUrl : DEFAULT_PUBLIC_ROUTE}
          className="mt-5 inline-flex w-full items-center justify-center rounded-md border border-[#1E3A5F]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
        >
          Browse events
        </Link>
      );
    }

    return (
      <Link
        href={loginUrlForTier("free")}
        className="mt-5 inline-flex w-full items-center justify-center rounded-md border border-[#1E3A5F]/20 bg-white px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
      >
        Get started free
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      {noticeTier && mode === "manage" ? (
        <div
          className="rounded-lg border border-[#E87722]/30 bg-[#fff8f3] px-4 py-3 text-sm text-[#1E3A5F]"
          role="status"
        >
          You selected{" "}
          <strong>{tiers.find((t) => t.slug === noticeTier)?.display_name ?? noticeTier}</strong>.
          Complete checkout below when you&apos;re ready.
        </div>
      ) : null}

      {mode === "manage" && currentTierSlug === "free" ? (
        <p className="text-sm text-[#1E3A5F]/75">
          You&apos;re on the <strong>Free</strong> tier. Upgrade to enter most Peer Racing events —
          paid plans renew automatically each year.
        </p>
      ) : null}

      {mode === "manage" && currentTierSlug && currentTierSlug !== "free" ? (
        <p className="text-sm text-[#1E3A5F]/75">
          Compare plans below. Upgrade to unlock premium-only races and higher-tier entry.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          const isCurrent = mode === "manage" && tier.slug === currentTierSlug;
          const featured = tier.slug === featuredSlug && tier.is_paid;
          const highlighted = tier.slug === noticeTier;

          return (
            <article
              key={tier.slug}
              className={`relative flex flex-col rounded-xl border bg-white p-5 shadow-sm sm:p-6 ${
                isCurrent
                  ? "border-emerald-300 ring-1 ring-emerald-200"
                  : highlighted
                    ? "border-[#E87722] ring-1 ring-[#E87722]/40"
                    : featured
                      ? "border-[#E87722]/50 ring-1 ring-[#E87722]/25"
                      : "border-[#1E3A5F]/10"
              }`}
            >
              {featured && !isCurrent ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#E87722] px-3 py-0.5 text-xs font-semibold text-white">
                  Most popular
                </span>
              ) : null}
              {isCurrent ? (
                <span className="absolute -top-3 right-4 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold text-white">
                  Your plan
                </span>
              ) : null}

              <h3 className="font-display text-xl font-semibold text-[#1E3A5F]">{tier.display_name}</h3>
              <p className="mt-3 font-display text-3xl font-bold tracking-tight text-[#1E3A5F]">
                {formatTierPriceUsd(tier.price_cents).replace("/yr", "")}
                {tier.price_cents > 0 ? (
                  <span className="text-base font-medium text-[#1E3A5F]/55">/yr</span>
                ) : null}
              </p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[#1E3A5F]/70">{tier.description}</p>
              {renderAction(tier)}
            </article>
          );
        })}
      </div>

      {mode === "manage" && showDevFree ? (
        <div className="rounded-lg border border-dashed border-[#1E3A5F]/20 bg-[#fafbfc] p-4">
          <button
            type="button"
            onClick={() => void handleDevFreeRenew()}
            disabled={status === "loading"}
            className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {status === "loading" ? "Renewing…" : "Renew membership (dev — no Stripe)"}
          </button>
        </div>
      ) : null}

      {error ? (
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
