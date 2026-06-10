import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { SHARE_CARD_TEMPLATES } from "@/components/share/ShareCardTemplates";
import type { ShareCardData } from "@/components/share/ShareCardTemplates";

/**
 * Design playground for the race-finish share cards (overlay the racer's photo gets
 * when they snap a race-day pic in the app). Placeholder layouts — final designs TBD.
 */

const SAMPLES: ShareCardData[] = [
  {
    firstName: "Jordan",
    lastName: "Reed",
    raceName: "50 Miler",
    eventName: "Frostbite Festival",
    timeRaw: "7:42:18",
    overallPlace: 3,
    division: "Alpha",
    divisionPlace: 3,
    payoutCents: 41200,
    eventTotalPayoutCents: 1240000,
  },
  {
    firstName: "Casey",
    lastName: "Torres",
    raceName: "Half Marathon",
    eventName: "Frostbite Festival",
    timeRaw: "2:18:09",
    overallPlace: 41,
    division: "Charlie",
    divisionPlace: 2,
    payoutCents: 23000,
    eventTotalPayoutCents: 1240000,
  },
  {
    firstName: "Sage",
    lastName: "Nguyen",
    raceName: "10K",
    eventName: "Frostbite Festival",
    timeRaw: "1:21:44",
    overallPlace: 88,
    division: "Echo",
    divisionPlace: 1,
    payoutCents: 18500,
    eventTotalPayoutCents: 1240000,
  },
];

export default function ShareCardPlaygroundPage() {
  return (
    <div className="min-h-screen bg-[#fafbfc]">
      <LandingNavbar />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#1E3A5F]/60">
          Design playground
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-[#1E3A5F]">
          Race-finish share cards
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/70">
          Placeholder layouts for the photo overlay racers get after results publish: snap a race-day
          pic, the card composites on top, share to socials. Money is always shown — transparency is
          the brand. Five rough slot layouts below, each shown with three sample racers; real designs
          replace these.
        </p>

        <div className="mt-10 space-y-12">
          {SHARE_CARD_TEMPLATES.map(({ id, name, Component }) => (
            <section key={id}>
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">
                {name}
                <span className="ml-2 font-mono text-xs font-normal text-[#1E3A5F]/50">{id}</span>
              </h2>
              <div className="mt-4 flex flex-wrap gap-6">
                {SAMPLES.map((d) => (
                  <Component key={`${id}-${d.firstName}`} d={d} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
