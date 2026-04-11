import Image from "next/image";
import Link from "next/link";

import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";

export default async function EntryClosedPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto flex max-w-lg flex-col items-center px-4 py-12 text-center sm:px-6 sm:py-16">
        <Image
          src="/PR_LOGO_COLOR.png"
          alt="Peer Racing"
          width={320}
          height={128}
          className="h-auto w-full max-w-[280px]"
          priority
        />

        <h1 className="font-display mt-8 text-2xl font-bold tracking-tight text-[#1E3A5F] sm:text-3xl">
          Entries Are Closed
        </h1>

        <p className="mt-4 text-pretty text-base leading-relaxed text-[#1E3A5F]/85">
          We&apos;re sorry — entries for the races you have chosen are now closed. Please refresh
          your browser or go back to make sure we get you entered in the next Peer Racing event!
        </p>

        <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href={`/events/${id}`}
            className="inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-5 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
          >
            Back to event
          </Link>
          <Link
            href={DEFAULT_PUBLIC_ROUTE}
            className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
          >
            Browse upcoming races
          </Link>
        </div>
      </main>
    </div>
  );
}
