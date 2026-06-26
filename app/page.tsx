import Link from "next/link";
import Image from "next/image";

import { TeamDivisionGrid } from "@/components/landing/TeamDivisionGrid";
import { VisualExampleImage } from "@/components/landing/VisualExampleImage";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { DEFAULT_PUBLIC_ROUTE } from "@/lib/routes";

/** Bump when team badge PNGs in /public are replaced (busts browser cache). */
const TEAM_BADGE_VERSION = "20260624";

const teams = [
  {
    name: "Alpha Team",
    src: `/PNG_1000px/PR_Alpha_1000.png?v=${TEAM_BADGE_VERSION}`,
    description:
      "The Alpha Team, reminiscent of sharp mountain peaks, embodies the highest level of racing achievement. It serves as an aspirational symbol for those who dare to reach the summit of their potential. Alpha Team racers are the exemplars of dedication and unwavering commitment, inspiring others with their pursuit of greatness.",
  },
  {
    name: "Bravo Team",
    src: `/PNG_1000px/PR_Bravo_1000.png?v=${TEAM_BADGE_VERSION}`,
    description:
      "The Bravo Team, who are lightning fast, represents racers who ignite the race with their relentless drive. These individuals thrive on challenges, constantly pushing their limits to achieve excellence. For Bravo Team members, every race is a lightning-paced journey, where determination towards a new PR fuels their quest for the finish line. Their drive for excellence is fueled by passion and intensity while they electrify the racers around them.",
  },
  {
    name: "Charlie Team",
    src: `/PNG_1000px/PR_Charlie_1000.png?v=${TEAM_BADGE_VERSION}`,
    description:
      "The Charlie Team, symbolized by ladder rungs ascending, signifies racers who are steadily climbing to new heights in their journey. Whether they are seasoned racers looking for consistent progress or beginners taking their initial strides, the Charlie Team embodies the upward trajectory of personal growth. Every stride is a testament to their commitment to improvement.",
  },
  {
    name: "Delta Team",
    src: `/PNG_1000px/PR_Delta_1000.png?v=${TEAM_BADGE_VERSION}`,
    description:
      "The Delta Team, constantly ascending, signifies a community of racers united by their unwavering commitment to progress. Within the Delta Team, racers span various levels, from those taking their initial strides to seasoned racers seeking a steady course. This group embodies the upward trajectory of personal growth, where each step marks significant progress. Racers who make up the Delta Team share a common spirit of resilience, always aiming higher.",
  },
  {
    name: "Echo Team",
    src: `/PNG_1000px/PR_Echo_1000.png?v=${TEAM_BADGE_VERSION}`,
    description:
      "The Echo Base represents the foundational level of Peer Racing, where every racer's journey begins. Just as we all start somewhere, the Echo Team embraces the spirit of new beginnings and fresh aspirations. These racers might be taking their initial steps into the racing world or choosing a different path to health and fitness. The Echo Team is united by the shared belief that every stride, no matter how small, contributes to a powerful journey.",
  },
] as const;

const founderMessageParagraphs = [
  `Here's the deal — Peer Racing takes the oldest sport in the world, the foot race, and adds a twist to the competition. We aren't bending the rules — with a little help from a really cool algorithm, we're rewriting what it means to race at your own pace, compete at your own level, and have a fair, honest shot at winning — whether you're an elite runner or it's your first time lacing up your shoes.`,
  `I've spent the last 25 years producing, scheduling, announcing, and interviewing competitors that collectively win over $110 million per year in a relatively unknown recreational industry — a model that rewards everyday, hobbyist competitors: moms, dads, business owners — not professional athletes. After training for and running my first 100K a few years ago, I was driven to bring that same opportunity to running and offer competitors of all levels the same kind of upside.`,
  `If I've heard it once, I've heard it a thousand times — how many of us couldn't care less about another free t-shirt and a banana at the end of a race? How about earning a spot on a team and actually having a shot at cash and prizes — whether you split the gates and ran a 5-minute mile or gutted out a rough 14-minute mile. We've all been there. But have you ever had a legitimate chance at stepping on a podium against a field of like-paced runners? Now you do.`,
  `Peer Racing groups runners by true performance so you're competing against people at your own pace, not the entire field. Yes, the entry might be higher, but that's because you're buying into a real prize pool where the risk vs. reward actually makes sense. With your help, we can build something fun, inclusive, and fair that could eventually eclipse that $110M — mixing the passion of running with real upside, cash, and badass prizes for competitors at every level.`,
  `All of sport is built around the recreational athlete. We buy the tickets, buy the merch, watch the games, cheer on our favorite runners, and follow the stars. At Peer Racing, our absolute determination is to celebrate and reward competitors at all levels — from elites all the way to beginners.`,
  `On any given day, anyone — ANYONE — can end up on top of a podium. From elite runners who win the race on Team Alpha, the hard runners on Team Bravo, those digging deep that land on Team Charlie, the Deltas grinding out the miles, or the Team Echo runners who never thought they could stay on their feet for three miles. You'll enter a Peer Racing event as a runner… but you'll leave a team member. And on that day — no matter your pace — you might be the #1 racer amongst your peers standing on your team's podium.`,
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-white font-sans text-[#1E3A5F]">
      <LandingNavbar />

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="text-center sm:text-left">
          <div className="mb-6 flex justify-center sm:justify-start">
            <Image
              src="/PR_LOGO_COLOR.png"
              alt="Peer Racing"
              width={560}
              height={224}
              className="h-auto w-full max-w-[320px] sm:max-w-[380px]"
              priority
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
            Community-powered racing
          </p>
          <h1 className="font-display mt-3 text-balance text-3xl font-bold tracking-tight text-[#1E3A5F] sm:text-4xl">
            Welcome to Peer Racing
          </h1>
          <p className="mt-4 max-w-3xl text-pretty text-base leading-relaxed text-[#1E3A5F]/80 sm:mx-0 sm:text-lg">
            where racers of every pace find their place. Whether you&apos;re a seasoned racer, a
            determined enthusiast, a resilient challenger, an ambitious achiever, or someone just
            starting your journey, we&apos;re here to celebrate your unique path. At Peer Racing,
            it&apos;s not about how fast you race; it&apos;s about embracing your pace and enjoying the
            journey. Stride with us and discover a community that&apos;s by your side, stride for
            stride, stroke for stroke.
          </p>
          <p className="mt-3 max-w-3xl text-pretty text-base leading-relaxed text-[#1E3A5F]/80 sm:mx-0 sm:text-lg">
            Together, we&apos;re redefining what it means to win in the world of racing, offering
            podiums, cash payouts, prizes, and the thrill of achievement to racers of all levels.
            Set your pace, win your way - with Peer Racing.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-start sm:gap-4">
            <Link
              href={DEFAULT_PUBLIC_ROUTE}
              className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90"
            >
              Find a Race
            </Link>
            <Link
              href="/promoter"
              className="inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-semibold text-[#1E3A5F]/80 underline decoration-[#1E3A5F]/30 underline-offset-4 transition-colors hover:text-[#E87722] hover:decoration-[#E87722]"
            >
              Create an event (promoters)
            </Link>
          </div>

          <p className="mx-auto mt-4 max-w-2xl text-center text-xs text-[#1E3A5F]/60 sm:text-left">
            All users are Peer Racing members. Entering a race will walk you through membership if
            needed.
          </p>
        </section>

        <section
          id="from-founder"
          className="mt-14 scroll-mt-24 rounded-xl border border-[#1E3A5F]/10 bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 className="font-display text-pretty text-xl font-semibold tracking-tight text-[#1E3A5F] sm:text-2xl">
            Peer Racing Was Created for Every Runner at Every Level.
          </h2>

          <div className="mt-5 rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc]">
            <p className="border-b border-[#1E3A5F]/10 px-4 py-4 text-pretty text-sm leading-relaxed text-[#1E3A5F]/85 sm:px-5 sm:py-5 sm:text-base">
              {founderMessageParagraphs[0]}
            </p>

            <details className="group open:shadow-sm">
              <summary className="cursor-pointer list-none px-4 py-3.5 text-sm font-semibold text-[#1E3A5F] transition-colors marker:content-none [&::-webkit-details-marker]:hidden sm:px-5 sm:py-4 sm:text-base">
                <span className="flex items-center justify-between gap-3">
                  <span>Read more from our founder — Dru Stewart</span>
                  <span
                    className="shrink-0 text-[#E87722] transition-transform group-open:rotate-180"
                    aria-hidden
                  >
                    ▼
                  </span>
                </span>
              </summary>
              <div className="space-y-4 border-t border-[#1E3A5F]/10 px-4 pb-5 pt-4 text-pretty text-sm leading-relaxed text-[#1E3A5F]/85 sm:px-5 sm:text-base">
                {founderMessageParagraphs.slice(1).map((text, i) => (
                  <p key={i}>{text}</p>
                ))}
              </div>
            </details>
          </div>

          <div className="mt-5">
            <Link
              href={DEFAULT_PUBLIC_ROUTE}
              className="inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E87722]/90"
            >
              Browse races to enter
            </Link>
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-4 text-center sm:text-left">
            <h2 className="font-display text-pretty text-xl font-semibold tracking-tight text-[#1E3A5F] sm:text-2xl">
              You&apos;ll enter a Peer Racing event as a runner… but you&apos;ll leave a team member
            </h2>
            <p className="mt-1 text-sm text-[#1E3A5F]/70">
              Run your race and become part of one of the Peer Racing Teams!
            </p>
          </div>
          <TeamDivisionGrid teams={teams} />
        </section>

        <section id="visual-example" className="mt-14 scroll-mt-24">
          <div className="flex flex-col items-center rounded-xl border border-[#1E3A5F]/10 bg-[#1E3A5F]/5 px-3 py-6 sm:px-6 sm:py-8">
            <h2 className="font-display text-center text-lg font-semibold text-[#1E3A5F] sm:text-xl md:text-2xl">
              Visual Example of How Peer Racing Works
            </h2>
            <VisualExampleImage
              src="/HowPRWorks.png"
              alt="Visual diagram of how Peer Racing works"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1E3A5F]/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center sm:px-6">
          <p className="text-sm text-[#1E3A5F]/60">
            Peer Racing — set your pace, win your way. MVP testing build.
          </p>
        </div>
      </footer>
    </div>
  );
}
