import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-6 sm:px-6">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Peer Racing
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Community-powered racing for promoters and runners.
            </p>
          </div>
          <Link
            href="/login"
            className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-400 hover:text-white"
          >
            Sign in
          </Link>
        </header>

        <section className="mb-10">
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
            Host races, enter events, and pace friends — all in one place.
          </h1>
          <p className="mt-4 text-pretty text-sm leading-relaxed text-zinc-400 sm:text-base">
            Peer Racing makes it simple for local promoters to publish events and for
            runners to enter races, track results, and find trusted pacers.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/promoter"
              className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-950 shadow-sm transition hover:bg-white"
            >
              Create an event
            </Link>
            <Link
              href="/events"
              className="inline-flex items-center justify-center rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-100 hover:border-zinc-400 hover:text-white"
            >
              Browse races
            </Link>
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            All users are Peer Racing members. Creating or entering an event will walk
            you through membership if needed.
          </p>
        </section>

        <section className="mb-10 space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-50">
              For promoters
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Set up events, distances, fees, and peer racing qualifiers in minutes. See
              entries in real time and manage your race day roster.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-50">
              For runners
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Create a profile once, then enter events with saved info, PR tracking, and
              birthday-month credits on Peer Racing fees.
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold text-zinc-50">
              For pacers
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Accept pacer requests from the community and help friends hit their goals,
              with clear pacer eligibility and status.
            </p>
          </div>
        </section>

        <footer className="mt-auto border-t border-zinc-900 pt-4 text-xs text-zinc-500">
          <p>Peer Racing MVP &mdash; internal testing build.</p>
        </footer>
      </div>
    </main>
  );
}
