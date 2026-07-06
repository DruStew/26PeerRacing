/**
 * Race-day logistics helpers: check-in windows, walk-up fees, aid stations.
 * The check-in window defaults to one hour before gun → gun time when the
 * promoter has not set one explicitly, so every race gets a window for free.
 */

export type DistanceLogistics = {
  gun_time?: string | null;
  check_in_opens_at?: string | null;
  check_in_closes_at?: string | null;
  allow_walk_ups?: boolean | null;
  walk_up_fee_cents?: number | null;
  entry_fee_cents?: number | null;
  start_location_name?: string | null;
  start_location_address?: string | null;
  start_lat?: number | null;
  start_lng?: number | null;
  course_cutoff_at?: string | null;
  course_cutoff_text?: string | null;
  packet_pickup_info?: string | null;
  additional_notes?: string | null;
};

export type AidStationRow = {
  id: string;
  name: string;
  mile_marker: string | null;
  lat: number | null;
  lng: number | null;
  drop_bags: boolean;
  sort_order: number;
};

const DEFAULT_CHECK_IN_MINUTES_BEFORE_GUN = 60;

/** Explicit check-in window, or derived from gun time (gun − 60 min → gun). */
export function effectiveCheckInWindow(d: DistanceLogistics): {
  opensAt: string | null;
  closesAt: string | null;
  derived: boolean;
} {
  const explicitOpens = d.check_in_opens_at?.trim() || null;
  const explicitCloses = d.check_in_closes_at?.trim() || null;
  if (explicitOpens || explicitCloses) {
    return { opensAt: explicitOpens, closesAt: explicitCloses, derived: false };
  }

  const gun = d.gun_time?.trim() || null;
  if (!gun) return { opensAt: null, closesAt: null, derived: false };
  const gunDate = new Date(gun);
  if (Number.isNaN(gunDate.getTime())) return { opensAt: null, closesAt: null, derived: false };

  const opens = new Date(gunDate.getTime() - DEFAULT_CHECK_IN_MINUTES_BEFORE_GUN * 60 * 1000);
  return { opensAt: opens.toISOString(), closesAt: gunDate.toISOString(), derived: true };
}

/** Race-day walk-up fee; falls back to the online entry fee. */
export function effectiveWalkUpFeeCents(d: DistanceLogistics): number {
  if (typeof d.walk_up_fee_cents === "number" && d.walk_up_fee_cents >= 0) {
    return d.walk_up_fee_cents;
  }
  return Math.max(0, d.entry_fee_cents ?? 0);
}

export function walkUpsAllowed(d: DistanceLogistics): boolean {
  return d.allow_walk_ups !== false;
}

/** Whether a distance has a start line distinct from the event venue. */
export function hasCustomStartLocation(d: DistanceLogistics): boolean {
  return Boolean(d.start_location_name?.trim() || (d.start_lat != null && d.start_lng != null));
}
