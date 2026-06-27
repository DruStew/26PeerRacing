"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { saveMemberAccountSettings } from "@/app/admin/members/actions";
import type { ManageableRole } from "@/lib/admin/member-roles";
import { formatTierPriceUsd } from "@/lib/membership-tier-config";

type TierOption = {
  slug: string;
  display_name: string;
  price_cents: number;
};

type RoleState = {
  superAdmin: boolean;
  admin: boolean;
  promoter: boolean;
  booth: boolean;
};

type Props = {
  userId: string;
  canManagePrivilegedRoles: boolean;
  initialRoles: RoleState;
  initialTier: string;
  tiers: TierOption[];
};

const roleRows: {
  key: ManageableRole;
  stateKey: keyof RoleState;
  label: string;
  hint: string;
  privileged?: boolean;
}[] = [
  {
    key: "super_admin",
    stateKey: "superAdmin",
    label: "Super Admin",
    hint: "Full platform control — assign admins, edit membership tiers",
    privileged: true,
  },
  {
    key: "admin",
    stateKey: "admin",
    label: "Admin",
    hint: "Internal admin access",
    privileged: true,
  },
  {
    key: "promoter",
    stateKey: "promoter",
    label: "Promoter",
    hint: "Host and edit own events",
  },
  {
    key: "booth",
    stateKey: "booth",
    label: "Race check-in",
    hint: "Check-in desk (booth role in database)",
  },
];

function rolesDirty(a: RoleState, b: RoleState): boolean {
  return (
    a.superAdmin !== b.superAdmin ||
    a.admin !== b.admin ||
    a.promoter !== b.promoter ||
    a.booth !== b.booth
  );
}

export function MemberAccountEditor({
  userId,
  canManagePrivilegedRoles,
  initialRoles,
  initialTier,
  tiers,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [roles, setRoles] = useState(initialRoles);
  const [tier, setTier] = useState(initialTier);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    setRoles(initialRoles);
    setTier(initialTier);
    setMessage(null);
  }, [initialRoles, initialTier, userId]);

  const dirty = tier !== initialTier || rolesDirty(roles, initialRoles);
  const hasPlatformRole = roles.superAdmin || roles.admin || roles.promoter || roles.booth;

  function toggleRole(stateKey: keyof RoleState, next: boolean) {
    setMessage(null);
    setRoles((current) => ({ ...current, [stateKey]: next }));
  }

  function handleSave() {
    if (!dirty || pending) return;
    setMessage(null);

    startTransition(async () => {
      const result = await saveMemberAccountSettings(userId, {
        superAdmin: roles.superAdmin,
        admin: roles.admin,
        promoter: roles.promoter,
        booth: roles.booth,
        tierSlug: tier,
      });

      if (!result.ok) {
        setMessage({ type: "error", text: result.error });
        return;
      }

      setMessage({ type: "success", text: "Changes saved." });
      router.refresh();
    });
  }

  function handleReset() {
    setRoles(initialRoles);
    setTier(initialTier);
    setMessage(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#1E3A5F]">Platform Roles</h3>
        <div className="mt-3 space-y-2">
          {!hasPlatformRole ? (
            <p className="rounded-lg border border-[#1E3A5F]/10 bg-white px-3 py-2 text-sm text-[#1E3A5F]/70">
              <span className="font-medium text-[#1E3A5F]">Member</span> — default account with no
              platform role.
            </p>
          ) : null}
          {roleRows.map((row) => {
            if (row.privileged && !canManagePrivilegedRoles) return null;
            return (
              <label
                key={row.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border border-[#1E3A5F]/10 bg-white px-3 py-2 ${pending ? "opacity-70" : ""}`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
                  checked={roles[row.stateKey]}
                  disabled={pending}
                  onChange={(e) => toggleRole(row.stateKey, e.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#1E3A5F]">{row.label}</span>
                  <span className="block text-xs text-[#1E3A5F]/55">{row.hint}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor={`tier-${userId}`} className="text-sm font-semibold text-[#1E3A5F]">
          Membership level
        </label>
        <select
          id={`tier-${userId}`}
          value={tier}
          disabled={pending}
          onChange={(e) => {
            setMessage(null);
            setTier(e.target.value);
          }}
          className="mt-1 w-full rounded-md border border-[#1E3A5F]/20 bg-white px-3 py-2 text-sm text-[#1E3A5F] shadow-sm focus:border-[#E87722] focus:outline-none focus:ring-1 focus:ring-[#E87722] disabled:opacity-70"
        >
          {tiers.map((t) => (
            <option key={t.slug} value={t.slug}>
              {t.display_name} ({formatTierPriceUsd(t.price_cents)})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={handleSave}
          className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {dirty ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleReset}
            className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#1E3A5F] disabled:opacity-50"
          >
            Reset
          </button>
        ) : null}
      </div>

      {message ? (
        <p
          className={`text-sm font-medium ${message.type === "error" ? "text-red-700" : "text-emerald-700"}`}
          role={message.type === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}

      {dirty && !message ? (
        <p className="text-xs text-[#1E3A5F]/55">You have unsaved changes.</p>
      ) : null}
    </div>
  );
}
