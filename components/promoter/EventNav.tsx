import Link from "next/link";

const TABS = [
  { key: "edit", label: "Manage Race", path: "edit" },
  { key: "roster", label: "Check-In Roster", path: "roster" },
  { key: "kiosk", label: "Race Day Kiosk", path: "kiosk" },
  { key: "payout", label: "Payout Calculator", path: "payout" },
  { key: "results", label: "Results Console", path: "results" },
] as const;

export type EventNavTab = (typeof TABS)[number]["key"];

/** Quick-jump buttons between the promoter tools for one event. */
export function EventNav({ eventId, current }: { eventId: string; current: EventNavTab }) {
  return (
    <nav className="mt-5 flex flex-wrap gap-2" aria-label="Event tools">
      {TABS.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={`/promoter/events/${eventId}/${t.path}`}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "inline-flex items-center rounded-md bg-[#1E3A5F] px-3.5 py-1.5 text-sm font-semibold text-white"
                : "inline-flex items-center rounded-md border border-[#1E3A5F]/20 bg-white px-3.5 py-1.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]"
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
