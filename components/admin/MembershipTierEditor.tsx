"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createMembershipTier, updateMembershipTier } from "@/app/admin/memberships/actions";
import { formatTierPriceUsd } from "@/lib/membership-tier-config";
import type { MembershipTierConfigRow } from "@/lib/membership-tier-config";

export function MembershipTierEditor({
  tier,
  canAddTiers,
}: {
  tier: MembershipTierConfigRow;
  canAddTiers: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await updateMembershipTier(tier.slug, formData);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
          {tier.display_name}
        </h2>
        <code className="rounded bg-[#1E3A5F]/10 px-2 py-0.5 text-xs">{tier.slug}</code>
      </div>
      <p className="mt-1 text-sm text-[#1E3A5F]/60">
        Current price: {formatTierPriceUsd(tier.price_cents)}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-sm font-medium text-[#1E3A5F]">Display name</label>
          <input
            name="display_name"
            defaultValue={tier.display_name}
            required
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium text-[#1E3A5F]">Description</label>
          <textarea
            name="description"
            defaultValue={tier.description ?? ""}
            rows={2}
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Price (cents)</label>
          <input
            name="price_cents"
            type="number"
            min={0}
            step={1}
            defaultValue={tier.price_cents}
            required
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-[#1E3A5F]/55">5000 = $50.00/yr</p>
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Stripe Price ID</label>
          <input
            name="stripe_price_id"
            defaultValue={tier.stripe_price_id ?? ""}
            placeholder="price_..."
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm font-mono text-xs"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Sort order</label>
          <input
            name="sort_order"
            type="number"
            defaultValue={tier.sort_order}
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Rank (eligibility hierarchy)</label>
          <input
            name="rank"
            type="number"
            defaultValue={tier.rank}
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-[#1E3A5F]/55">Higher rank satisfies lower tiers at races.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#1E3A5F]">
          <input
            type="checkbox"
            name="is_active"
            value="1"
            defaultChecked={tier.is_active}
            className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722]"
          />
          Active (visible to members)
        </label>
        <label className="flex items-center gap-2 text-sm text-[#1E3A5F]">
          <input
            type="checkbox"
            name="is_paid"
            value="1"
            defaultChecked={tier.is_paid}
            disabled={tier.slug === "free"}
            className="h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] disabled:opacity-60"
          />
          Paid tier (Stripe checkout)
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white hover:bg-[#E87722]/90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save tier"}
        </button>
        {message ? (
          <p className="text-sm font-medium text-red-700" role="alert">
            {message}
          </p>
        ) : null}
      </div>

      {!canAddTiers ? null : null}
    </form>
  );
}

export function AddMembershipTierForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 rounded-md border border-dashed border-[#1E3A5F]/25 px-4 py-3 text-sm font-medium text-[#1E3A5F] hover:border-[#E87722] hover:text-[#E87722]"
      >
        + Add membership tier
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createMembershipTier(formData);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 rounded-xl border border-[#E87722]/30 bg-[#fff8f3] p-5 shadow-sm"
    >
      <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">New Membership Tier</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Slug</label>
          <input
            name="slug"
            required
            placeholder="elite"
            pattern="[a-z0-9_]+"
            className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Display name</label>
          <input name="display_name" required className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Price (cents)</label>
          <input name="price_cents" type="number" min={0} defaultValue={10000} className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Stripe Price ID</label>
          <input name="stripe_price_id" className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm font-mono text-xs" />
        </div>
        <label className="flex items-center gap-2 text-sm text-[#1E3A5F] sm:col-span-2">
          <input type="checkbox" name="is_paid" value="1" defaultChecked className="h-4 w-4 rounded" />
          Paid tier
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Creating…" : "Create tier"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-[#1E3A5F]/70 hover:text-[#1E3A5F]">
          Cancel
        </button>
        {message ? <p className="text-sm text-red-700">{message}</p> : null}
      </div>
    </form>
  );
}
