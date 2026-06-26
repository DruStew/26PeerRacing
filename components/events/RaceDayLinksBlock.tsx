import type { RaceDayLink } from "@/lib/race-day-links";
import { normalizeRaceDayLinks } from "@/lib/race-day-links";

const linkButtonClass =
  "inline-flex items-center justify-center rounded-md bg-[#E87722] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90";

export function RaceDayLinksBlock({
  links,
  className = "mt-4",
  heading = "Race Day Links",
}: {
  links: RaceDayLink[];
  className?: string;
  heading?: string | null;
}) {
  const safe = normalizeRaceDayLinks(links);
  if (safe.length === 0) return null;

  return (
    <div className={className}>
      {heading ? (
        <h3 className="font-display text-base font-semibold text-[#1E3A5F]">{heading}</h3>
      ) : null}
      <div className={`flex flex-wrap gap-3 ${heading ? "mt-3" : ""}`}>
        {safe.map((link) => (
          <a
            key={`${link.label}-${link.url}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className={linkButtonClass}
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  );
}
