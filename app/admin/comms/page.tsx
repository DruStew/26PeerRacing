import Link from "next/link";

export default function AdminCommsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
        Admin
      </p>
      <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
        Communications
      </h1>
      <p className="mt-3 max-w-2xl text-pretty text-[#1E3A5F]/75">
        Send email or SMS to one racer, a segment (e.g. by distance), or everyone registered for an
        event. This section is a placeholder until transactional email and SMS providers are
        connected and compliance (opt-in, unsubscribe) is wired up.
      </p>

      <div className="mt-10 rounded-xl border border-dashed border-[#1E3A5F]/25 bg-[#fafbfc] p-8 text-center">
        <p className="font-display text-lg font-semibold text-[#1E3A5F]">Coming soon</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#1E3A5F]/70">
          You&apos;ll choose a channel, pick recipients from search or filters, preview a template,
          and review a send log — all from here.
        </p>
      </div>

      <p className="mt-8 text-sm text-[#1E3A5F]/60">
        Until then, use{" "}
        <Link href="/admin/events" className="font-medium text-[#E87722] hover:underline">
          Events → entrants
        </Link>{" "}
        for individual email and phone links.
      </p>
    </main>
  );
}
