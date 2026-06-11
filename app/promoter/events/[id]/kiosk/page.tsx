import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { EventNav } from "@/components/promoter/EventNav";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { PromoterKioskClient } from "./PromoterKioskClient";

export default async function PromoterKioskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?returnUrl=${encodeURIComponent(`/promoter/events/${id}/kiosk`)}`);
  }

  const { data: event, error } = await supabase
    .from("events")
    .select("id,name,promoter_id")
    .eq("id", id)
    .single();

  if (error || !event) {
    notFound();
  }

  const promoterId = (event as { promoter_id?: string }).promoter_id;
  const isPromoter = user.id === promoterId;
  const { data: adminRoleRow } = await supabase
    .from("roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!isPromoter && !adminRoleRow) {
    notFound();
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const baseUrl = host ? `${proto}://${host}` : "";

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <Link
          href={`/promoter/events/${id}/edit`}
          className="text-sm font-medium text-[#1E3A5F]/70 hover:text-[#E87722]"
        >
          ← Edit event
        </Link>

        <EventNav eventId={id} current="kiosk" />

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">Race Day</p>
        <h1 className="font-display mt-2 text-3xl font-bold text-[#1E3A5F]">Kiosk &amp; Terminals</h1>
        <p className="mt-2 text-sm text-[#1E3A5F]/75">{(event as { name: string }).name}</p>

        <PromoterKioskClient eventId={id} baseUrl={baseUrl} />
      </main>
    </div>
  );
}
