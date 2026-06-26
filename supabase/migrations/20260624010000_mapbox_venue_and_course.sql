-- Mapbox support: event venue location (for directions) + per-distance course geometry.

alter table public.events
  add column if not exists venue_name text null,
  add column if not exists venue_address text null,
  add column if not exists venue_lat double precision null,
  add column if not exists venue_lng double precision null;

comment on column public.events.venue_lat is 'Venue latitude (WGS84) for the map pin / directions deep link.';
comment on column public.events.venue_lng is 'Venue longitude (WGS84) for the map pin / directions deep link.';

alter table public.distances
  add column if not exists course_geojson jsonb null,
  add column if not exists course_distance_meters double precision null;

comment on column public.distances.course_geojson is
  'GeoJSON Feature/FeatureCollection of the drawn course route (LineString). Rendered read-only on public pages.';
comment on column public.distances.course_distance_meters is
  'Measured length of the drawn course in meters (Turf length); display only, not the official race distance.';

notify pgrst, 'reload schema';
