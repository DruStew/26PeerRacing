"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import { MAP_STYLE, MAPBOX_TOKEN, VENUE_PIN_COLOR } from "@/lib/mapbox/config";
import { searchVenuePlaces, type VenueSearchBias } from "@/lib/mapbox/venue-search";
import { RaceDayLinksBlock } from "@/components/events/RaceDayLinksBlock";
import {
  hydrateRaceDayLinks,
  isSafeExternalUrl,
  type RaceDayLink,
} from "@/lib/race-day-links";

type Venue = {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  raceDayNotes: string;
  raceDayLinks: RaceDayLink[];
};

type VenueInitial = Omit<Venue, "raceDayLinks"> & {
  raceDayLinks?: RaceDayLink[] | unknown;
};

function buildInitialVenue(initial: VenueInitial): Venue {
  const hydrated = hydrateRaceDayLinks(initial.raceDayLinks, initial.raceDayNotes);
  return {
    name: initial.name,
    address: initial.address,
    lat: initial.lat,
    lng: initial.lng,
    raceDayNotes: hydrated.raceDayNotes,
    raceDayLinks: hydrated.raceDayLinks,
  };
}

type GeoResult = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const btnPrimary =
  "inline-flex items-center justify-center rounded-md bg-[#E87722] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#E87722]/90 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "inline-flex items-center justify-center rounded-md border border-[#1E3A5F]/20 px-4 py-2.5 text-sm font-semibold text-[#1E3A5F] transition-colors hover:border-[#E87722] hover:text-[#E87722]";
const inputClass =
  "w-full rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";
const textareaClass =
  "w-full min-h-[8rem] resize-y rounded-lg border border-[#1E3A5F]/20 bg-white px-3 py-2.5 text-sm text-[#1E3A5F] placeholder:text-[#1E3A5F]/35 focus:border-[#E87722] focus:outline-none focus:ring-2 focus:ring-[#E87722]/25";

const RACE_DAY_NOTES_PLACEHOLDER =
  "Promoters, place important details such as links to parking passes, hotels, camping spots, etc and any other pertinent race day info such as starting points, aid stations, and etc.";

export function VenuePicker({
  eventId,
  initial,
  searchBias,
}: {
  eventId: string;
  initial: VenueInitial;
  /** Event city/state (and optional pin) to bias venue search toward the race location. */
  searchBias?: VenueSearchBias;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const [venue, setVenue] = useState<Venue>(() => buildInitialVenue(initial));
  const [query, setQuery] = useState(initial.address || initial.name || "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");

  const placeMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (!markerRef.current) {
      markerRef.current = new mapboxgl.Marker({ color: VENUE_PIN_COLOR, draggable: true })
        .setLngLat([lng, lat])
        .addTo(map);
      markerRef.current.on("dragend", () => {
        const ll = markerRef.current!.getLngLat();
        setVenue((v) => ({ ...v, lat: ll.lat, lng: ll.lng }));
      });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !MAPBOX_TOKEN) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const hasPin = initial.lat != null && initial.lng != null;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: hasPin ? [initial.lng!, initial.lat!] : [-98.5795, 39.8283],
      zoom: hasPin ? 13 : 3,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (hasPin) placeMarker(initial.lng!, initial.lat!);
    });

    // Click to drop / move the pin.
    map.on("click", (e) => {
      placeMarker(e.lngLat.lng, e.lngLat.lat);
      setVenue((v) => ({ ...v, lat: e.lngLat.lat, lng: e.lngLat.lng }));
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [initial.lat, initial.lng, placeMarker]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || !MAPBOX_TOKEN) return;
    setSearching(true);
    setError(null);
    try {
      const bias: VenueSearchBias = {
        ...searchBias,
        proximity:
          venue.lat != null && venue.lng != null
            ? { lat: venue.lat, lng: venue.lng }
            : searchBias?.proximity,
      };
      const mapped = await searchVenuePlaces(q, bias);
      setResults(mapped);
      if (mapped.length === 0) {
        setError(
          "No matches found. Try adding a city or state (e.g. Sequoyah State Park, OK), or click the map to drop a pin.",
        );
      }
    } catch {
      setError("Search failed. Check your Mapbox token.");
    } finally {
      setSearching(false);
    }
  }, [query, searchBias, venue.lat, venue.lng]);

  function selectResult(r: GeoResult) {
    setVenue((v) => ({ ...v, name: r.name, address: r.address, lat: r.lat, lng: r.lng }));
    setResults([]);
    const map = mapRef.current;
    if (map) {
      map.flyTo({ center: [r.lng, r.lat], zoom: 14 });
      placeMarker(r.lng, r.lat);
    }
  }

  function addLink() {
    const url = linkUrl.trim();
    if (!url) {
      setError("Enter a URL for the link.");
      return;
    }
    if (!isSafeExternalUrl(url)) {
      setError("Links must start with http:// or https://");
      return;
    }

    const label = linkLabel.trim() || "LINK HERE";
    setVenue((v) => ({
      ...v,
      raceDayLinks: [...v.raceDayLinks, { label, url }],
    }));
    setLinkLabel("");
    setLinkUrl("");
    setShowLinkForm(false);
    setError(null);
  }

  function removeLink(index: number) {
    setVenue((v) => ({
      ...v,
      raceDayLinks: v.raceDayLinks.filter((_, i) => i !== index),
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/promoter/events/${eventId}/venue`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venue_name: venue.name,
          venue_address: venue.address,
          venue_lat: venue.lat,
          venue_lng: venue.lng,
          race_day_notes: venue.raceDayNotes,
          race_day_links: venue.raceDayLinks,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Error ${res.status}`);
        return;
      }
      setNotice("Venue & directions saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (!MAPBOX_TOKEN) {
    return (
      <p className="rounded-lg border border-dashed border-[#1E3A5F]/20 bg-[#fafbfc] px-4 py-3 text-sm text-[#1E3A5F]/60">
        Set <code className="font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment to enable
        the venue map.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Search address or place (e.g. Zilker Park, Austin TX)"
          className={inputClass}
        />
        <button type="button" onClick={() => void runSearch()} disabled={searching} className={btnGhost}>
          {searching ? "Searching…" : "Search"}
        </button>
      </div>

      {results.length > 0 ? (
        <ul className="divide-y divide-[#1E3A5F]/10 overflow-hidden rounded-lg border border-[#1E3A5F]/15 bg-white">
          {results.map((r, i) => (
            <li key={`${r.lat}-${r.lng}-${i}`}>
              <button
                type="button"
                onClick={() => selectResult(r)}
                className="flex w-full flex-col items-start px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#fafbfc]"
              >
                <span className="font-medium text-[#1E3A5F]">{r.name || r.address}</span>
                {r.address && r.address !== r.name ? (
                  <span className="text-[#1E3A5F]/60">{r.address}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={containerRef} className="h-80 w-full overflow-hidden rounded-xl" />
      <p className="text-xs text-[#1E3A5F]/55">
        Search for the venue, then fine-tune by clicking the map or dragging the pin.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Venue name</label>
          <input
            value={venue.name}
            onChange={(e) => setVenue((v) => ({ ...v, name: e.target.value }))}
            placeholder="Start/finish area"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-[#1E3A5F]">Address</label>
          <input
            value={venue.address}
            onChange={(e) => setVenue((v) => ({ ...v, address: e.target.value }))}
            placeholder="Street, City, State"
            className={`mt-1.5 ${inputClass}`}
          />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-[#1E3A5F]">Race Day Notes</label>
        <textarea
          value={venue.raceDayNotes}
          onChange={(e) => setVenue((v) => ({ ...v, raceDayNotes: e.target.value }))}
          placeholder={RACE_DAY_NOTES_PLACEHOLDER}
          rows={5}
          className={`mt-1.5 ${textareaClass}`}
        />
      </div>

      <div className="rounded-xl border border-[#1E3A5F]/10 bg-[#fafbfc] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold text-[#1E3A5F]">Race Day Links</h3>
            <p className="mt-1 text-xs text-[#1E3A5F]/60">
              Add as many links as you need — they appear as orange buttons below your notes on the
              public event page.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowLinkForm((open) => !open)}
            className="text-sm font-semibold text-[#E87722] transition-colors hover:text-[#E87722]/80"
          >
            {showLinkForm ? "Cancel" : "Add link"}
          </button>
        </div>

        {showLinkForm ? (
          <div className="mt-3 grid gap-2 rounded-lg border border-[#1E3A5F]/15 bg-white p-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
            <div>
              <label className="text-xs font-medium text-[#1E3A5F]/70">Button label</label>
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Parking pass"
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#1E3A5F]/70">URL</label>
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://..."
                className={`mt-1 ${inputClass}`}
              />
            </div>
            <button type="button" onClick={addLink} className={`${btnGhost} w-full sm:w-auto`}>
              Add
            </button>
          </div>
        ) : null}

        {venue.raceDayLinks.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {venue.raceDayLinks.map((link, index) => (
              <li
                key={`${link.label}-${link.url}-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-[#1E3A5F]/10 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#1E3A5F]">{link.label}</p>
                  <p className="truncate text-xs text-[#1E3A5F]/55">{link.url}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeLink(index)}
                  className="shrink-0 text-xs font-semibold text-[#1E3A5F]/70 transition-colors hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#1E3A5F]/55">No links added yet.</p>
        )}

        {venue.raceDayLinks.length > 0 ? (
          <RaceDayLinksBlock links={venue.raceDayLinks} className="mt-5" heading="Preview" />
        ) : null}
      </div>

      <p className="text-xs text-[#1E3A5F]/55">
        {venue.lat != null && venue.lng != null
          ? `Pin: ${venue.lat.toFixed(5)}, ${venue.lng.toFixed(5)}`
          : "No pin set yet."}
      </p>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm font-medium text-emerald-700">{notice}</p> : null}

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className={btnPrimary}>
          {saving ? "Saving…" : "Save venue & directions"}
        </button>
        {venue.lat != null && venue.lng != null ? (
          <button
            type="button"
            onClick={() => {
              setVenue((v) => ({ ...v, lat: null, lng: null }));
              markerRef.current?.remove();
              markerRef.current = null;
            }}
            className={btnGhost}
          >
            Clear pin
          </button>
        ) : null}
      </div>
    </div>
  );
}
