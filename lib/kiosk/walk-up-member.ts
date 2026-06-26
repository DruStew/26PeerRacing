import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { batchResolveAuthUserIdsByEmail } from "@/lib/bulk-import/auth-lookup";
import { isPlausibleCellPhone } from "@/lib/profile";
import {
  kioskMagicLinkRedirect,
  resolveUserIdByEmail,
  sendPeerRacingMagicLinkEmail,
} from "@/lib/kiosk/send-magic-link";

export type WalkUpMemberInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  dob: string;
  sex: "male" | "female";
  active_or_retired_military: boolean;
  hometown?: string | null;
  home_state?: string | null;
  zip?: string | null;
};

export type WalkUpMemberResult =
  | {
      ok: true;
      userId: string;
      created: boolean;
      magicLinkSent: boolean;
      pr_id: string | null;
    }
  | { ok: false; error: string };

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function validateWalkUpMemberInput(raw: Partial<WalkUpMemberInput>): WalkUpMemberInput | null {
  const first_name = String(raw.first_name ?? "").trim();
  const last_name = String(raw.last_name ?? "").trim();
  const email = normalizeEmail(String(raw.email ?? ""));
  const phone = String(raw.phone ?? "").trim();
  const dob = String(raw.dob ?? "").trim();
  const sex = raw.sex === "male" || raw.sex === "female" ? raw.sex : null;
  const active_or_retired_military = raw.active_or_retired_military;

  if (!first_name || !last_name || !email || !dob || !sex) {
    return null;
  }
  if (active_or_retired_military !== true && active_or_retired_military !== false) {
    return null;
  }
  if (!isPlausibleCellPhone(phone)) {
    return null;
  }

  return {
    first_name,
    last_name,
    email,
    phone: normalizePhoneDigits(phone),
    dob,
    sex,
    active_or_retired_military,
    hometown: raw.hometown?.trim() || null,
    home_state: raw.home_state?.trim() || null,
    zip: raw.zip?.trim() || null,
  };
}

export async function createOrUpdateWalkUpMember(
  admin: SupabaseClient,
  input: WalkUpMemberInput,
  origin: string,
): Promise<WalkUpMemberResult> {
  let userId = await resolveUserIdByEmail(admin, input.email);
  let created = false;

  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      email_confirm: true,
      phone: input.phone,
      user_metadata: {
        first_name: input.first_name,
        last_name: input.last_name,
      },
    });

    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("duplicate") || error.status === 422) {
        const lookup = await batchResolveAuthUserIdsByEmail(admin, [input.email]);
        if (!lookup.ok) {
          return { ok: false, error: lookup.message };
        }
        userId = lookup.map.get(input.email) ?? null;
        if (!userId) {
          return { ok: false, error: "An account with this email already exists but could not be loaded." };
        }
      } else {
        return { ok: false, error: error.message };
      }
    } else {
      userId = data.user?.id ?? null;
      if (!userId) return { ok: false, error: "Account creation failed." };
      created = true;
    }
  }

  const profilePatch = {
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    phone: input.phone,
    dob: input.dob,
    sex: input.sex,
    active_or_retired_military: input.active_or_retired_military,
    hometown: input.hometown,
    home_state: input.home_state,
    zip: input.zip,
  };

  const { error: profileErr } = await admin.from("profiles").upsert(
    { id: userId, ...profilePatch },
    { onConflict: "id" },
  );

  if (profileErr) {
    return { ok: false, error: profileErr.message };
  }

  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership) {
    await admin.from("memberships").insert({
      user_id: userId,
      status: "active",
      tier: "free",
      membership_start_at: new Date().toISOString(),
      membership_end_at: null,
      renewal_count: 0,
      updated_at: new Date().toISOString(),
    });
  }

  const { data: profileRow } = await admin
    .from("profiles")
    .select("pr_id")
    .eq("id", userId)
    .maybeSingle();

  const magic = await sendPeerRacingMagicLinkEmail({
    email: input.email,
    redirectTo: kioskMagicLinkRedirect(origin),
  });

  return {
    ok: true,
    userId,
    created,
    magicLinkSent: magic.ok,
    pr_id: (profileRow as { pr_id?: string | null } | null)?.pr_id ?? null,
  };
}
