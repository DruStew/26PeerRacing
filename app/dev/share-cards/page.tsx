import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { ShareCardStudio } from "@/components/share/ShareCardStudio";
import type { ShareCardData } from "@/lib/share/share-card";

/**
 * Design playground for the racer share graphics — renders the real canvas
 * studio with sample data so layout changes can be checked without digging up
 * a published result.
 */

const SAMPLES: Array<{ title: string; data: ShareCardData }> = [
  {
    title: "Finish — big winner (all stats)",
    data: {
      kind: "finish",
      eventName: "Frostbite Festival",
      distanceLabel: "50 Miler",
      runnerName: "Jordan Reed",
      timeText: "7:42:18",
      division: "Alpha",
      divisionPlaceText: "1ST",
      overallText: "3RD OF 58 OVERALL",
      femalePoolText: "2ND FEMALE POOL · $180.00",
      militaryPoolText: "1ST MILITARY POOL · $240.00",
      moneyLines: [{ label: "ALPHA DIVISION", amountText: "$412.00" }],
      totalWonText: "$832.00",
      sponsorLogoUrl: null,
    },
  },
  {
    title: "Finish — mid-pack, no money",
    data: {
      kind: "finish",
      eventName: "Black Hills Backcountry Ultra",
      distanceLabel: "Half Marathon",
      runnerName: "Casey Torres",
      timeText: "2:18:09",
      division: "Charlie",
      divisionPlaceText: "14TH",
      overallText: "41ST OF 122 OVERALL",
      femalePoolText: null,
      militaryPoolText: null,
      moneyLines: [],
      totalWonText: null,
      // Stand-in sponsor so the "PR Results powered by" footer slot is visible.
      sponsorLogoUrl: "/PR_primarylogo.svg",
    },
  },
  {
    title: "Race day",
    data: {
      kind: "raceday",
      eventName: "Frostbite Festival",
      distanceLabel: "50 Miler",
      runnerName: "Jordan Reed",
      sponsorLogoUrl: null,
    },
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
          Racer share graphics
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#1E3A5F]/70">
          The real share studio with sample data. Racers see this on My Results (finish) and My
          Entries (race day) with their own numbers.
        </p>

        <div className="mt-10 space-y-12">
          {SAMPLES.map(({ title, data }) => (
            <section key={title}>
              <h2 className="font-display text-lg font-semibold text-[#1E3A5F]">{title}</h2>
              <div className="mt-4">
                <ShareCardStudio data={data} fileBase="sample" />
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
