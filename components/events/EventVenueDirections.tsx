import { CourseMapLazy } from "@/components/maps/CourseMapLazy";
import { DirectionsButton } from "@/components/maps/DirectionsButton";
import { RaceDayLinksBlock } from "@/components/events/RaceDayLinksBlock";
import type { RaceDayLink } from "@/lib/race-day-links";
import { hydrateRaceDayLinks } from "@/lib/race-day-links";

export type EventVenueFields = {
  eventName: string;
  fallbackLocation?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueLat?: number | null;
  venueLng?: number | null;
  raceDayNotes?: string | null;
  raceDayLinks?: RaceDayLink[] | null;
};

export function hasEventVenueContent(v: EventVenueFields): boolean {
  const hydrated = hydrateRaceDayLinks(v.raceDayLinks, v.raceDayNotes);
  const notes = hydrated.raceDayNotes.trim();
  const links = hydrated.raceDayLinks;
  const hasPin = v.venueLat != null && v.venueLng != null;
  const hasCopy = Boolean(v.venueName?.trim() || v.venueAddress?.trim());
  return hasPin || notes.length > 0 || links.length > 0 || hasCopy;
}

/** Venue pin, directions, map, race day notes, and link buttons for public event pages. */
export function EventVenueDirections({
  eventName,
  fallbackLocation,
  venueName,
  venueAddress,
  venueLat,
  venueLng,
  raceDayNotes,
  raceDayLinks,
  mapHeightClass = "h-72",
  className = "mt-10",
  showMap = true,
}: EventVenueFields & {
  mapHeightClass?: string;
  className?: string;
  showMap?: boolean;
}) {
  const fields = {
    eventName,
    fallbackLocation,
    venueName,
    venueAddress,
    venueLat,
    venueLng,
    raceDayNotes,
    raceDayLinks,
  };

  if (!hasEventVenueContent(fields)) return null;

  const hydrated = hydrateRaceDayLinks(raceDayLinks, raceDayNotes);
  const notes = hydrated.raceDayNotes;
  const links = hydrated.raceDayLinks;
  const hasPin = venueLat != null && venueLng != null;
  const name = venueName?.trim() ?? "";
  const address = venueAddress?.trim() ?? "";
  const mapLabel = name || eventName;
  const notesBlockOffset = showMap && hasPin ? "mt-6" : "mt-4";

  return (
    <section className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-[#1E3A5F]">Venue & Directions</h2>
          {name ? <p className="mt-1 text-sm font-medium text-[#1E3A5F]">{name}</p> : null}
          {address ? (
            <p className={`text-sm text-[#1E3A5F]/70 ${name ? "mt-0.5" : "mt-1"}`}>{address}</p>
          ) : null}
          {!name && !address && fallbackLocation ? (
            <p className="mt-1 text-sm text-[#1E3A5F]/70">{fallbackLocation}</p>
          ) : null}
        </div>
        {hasPin ? (
          <DirectionsButton lat={venueLat as number} lng={venueLng as number} label={mapLabel} />
        ) : null}
      </div>

      {showMap && hasPin ? (
        <div className="mt-4">
          <CourseMapLazy
            venue={{ lat: venueLat as number, lng: venueLng as number, label: mapLabel }}
            heightClass={mapHeightClass}
          />
        </div>
      ) : null}

      {notes ? (
        <div className={notesBlockOffset}>
          <h3 className="font-display text-base font-semibold text-[#1E3A5F]">Race Day Notes</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#1E3A5F]/80">{notes}</p>
        </div>
      ) : null}

      <RaceDayLinksBlock links={links} className={notes ? "mt-5" : notesBlockOffset} />
    </section>
  );
}
