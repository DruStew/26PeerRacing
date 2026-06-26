"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setMemberMembershipTier } from "@/app/admin/members/actions";
import { formatTierPriceUsd } from "@/lib/membership-tier-config";

type TierOption = {
  slug: string;
  display_name: string;
  price_cents: number;
};

type Props = {
  userId: string;
  initialTier: string;
  tiers: TierOption[];
};

export function MemberTierSelect({ userId, initialTier, tiers }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tier, setTier] = useState(initialTier);
  const [message, setMessage] = useState<string | null>(null);

  function onChange(next: string) {
    setMessage(null);
    const prev = tier;
    setTier(next);

    startTransition(async () => {
      const result = await setMemberMembershipTier(userId, next);
      if (!result.ok) {
        setTier(prev);
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <label htmlFor={`tier-${userId}`} className="text-sm font-semibold text-[#1E3A5F]">
        Membership level
      </label>
      <select
        id={`tier-${userId}`}
        value={tier}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] shadow-sm focus:border-[#E87722] focus:outline-none focus:ring-1 focus:ring-[#E87722] disabled:opacity-70"
      >
        {tiers.map((t) => (
          <option key={t.slug} value={t.slug}>
            {t.display_name} ({formatTierPriceUsd(t.price_cents)})
          </option>
        ))}
      </select>
      {message ? (
        <p className="mt-2 text-sm font-medium text-red-700" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
