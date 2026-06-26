import {
  AddMembershipTierForm,
  MembershipTierEditor,
} from "@/components/admin/MembershipTierEditor";
import { requireAdmin } from "@/lib/admin/require-admin";
import { fetchAllMembershipTierConfigsAdmin } from "@/lib/membership-tier-config.server";

export default async function AdminMembershipsPage() {
  const { admin } = await requireAdmin("/admin/memberships");
  const tiers = await fetchAllMembershipTierConfigsAdmin();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        Admin
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        Membership Tiers
      </h1>
      <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
        Configure display names, annual prices, and Stripe Price IDs. Changes apply to the renew page
        and checkout. Adding new tiers requires Super Admin; assign tiers to members on{" "}
        <a href="/admin/members" className="font-medium text-[#E87722] hover:underline">
          Members & Roles
        </a>
        .
      </p>

      <div className="mt-8 space-y-6">
        {tiers.map((tier) => (
          <MembershipTierEditor key={tier.slug} tier={tier} canAddTiers={admin.isSuperAdmin} />
        ))}
      </div>

      {admin.isSuperAdmin ? <AddMembershipTierForm /> : null}
    </main>
  );
}
