"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setGlobalRole } from "@/app/admin/members/actions";
import type { ManageableRole } from "@/lib/admin/member-roles";

type Props = {
  userId: string;
  canManagePrivilegedRoles: boolean;
  initial: {
    superAdmin: boolean;
    admin: boolean;
    promoter: boolean;
    booth: boolean;
  };
};

const rows: { key: ManageableRole; label: string; hint: string; privileged?: boolean }[] = [
  {
    key: "super_admin",
    label: "Super Admin",
    hint: "Full platform control — assign admins, edit membership tiers",
    privileged: true,
  },
  { key: "admin", label: "Admin", hint: "Internal admin access", privileged: true },
  { key: "promoter", label: "Promoter", hint: "Host and edit own events" },
  {
    key: "booth",
    label: "Race check-in",
    hint: "Check-in desk (booth role in database)",
  },
];

export function MemberRoleToggles({ userId, canManagePrivilegedRoles, initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);

  const hasPlatformRole = local.superAdmin || local.admin || local.promoter || local.booth;

  function toggle(role: ManageableRole, next: boolean) {
    setMessage(null);
    const prev = { ...local };
    const key =
      role === "super_admin"
        ? "superAdmin"
        : role === "admin"
          ? "admin"
          : role === "promoter"
            ? "promoter"
            : "booth";
    setLocal((s) => ({ ...s, [key]: next }));

    startTransition(async () => {
      const result = await setGlobalRole(userId, role, next);
      if (!result.ok) {
        setLocal(prev);
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-2">
      {!hasPlatformRole ? (
        <p className="rounded-lg border border-[#1E3A5F]/10 bg-white px-3 py-2 text-sm text-[#1E3A5F]/70">
          <span className="font-medium text-[#1E3A5F]">Member</span> — default account with no
          platform role.
        </p>
      ) : null}
      {rows.map((r) => {
        if (r.privileged && !canManagePrivilegedRoles) return null;
        const on =
          r.key === "super_admin"
            ? local.superAdmin
            : r.key === "admin"
              ? local.admin
              : r.key === "promoter"
                ? local.promoter
                : local.booth;
        return (
          <label
            key={r.key}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border border-[#1E3A5F]/10 bg-white px-3 py-2 ${pending ? "opacity-70" : ""}`}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-[#1E3A5F]/30 text-[#E87722] focus:ring-[#E87722]"
              checked={on}
              disabled={pending}
              onChange={(e) => toggle(r.key, e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-[#1E3A5F]">{r.label}</span>
              <span className="block text-xs text-[#1E3A5F]/55">{r.hint}</span>
            </span>
          </label>
        );
      })}
      {message ? (
        <p className="text-sm font-medium text-red-700" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
