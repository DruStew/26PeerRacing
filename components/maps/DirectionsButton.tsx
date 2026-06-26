import { directionsUrl } from "@/lib/mapbox/config";

type Props = {
  lat: number;
  lng: number;
  label?: string | null;
  className?: string;
};

/** "Get directions" deep link — opens the user's preferred maps/nav app. */
export function DirectionsButton({ lat, lng, label, className }: Props) {
  return (
    <a
      href={directionsUrl({ lat, lng, label })}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "inline-flex items-center justify-center gap-1.5 rounded-md bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1E3A5F]/90"
      }
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
        />
      </svg>
      Get directions
    </a>
  );
}
