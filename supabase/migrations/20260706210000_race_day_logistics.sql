-- Race-day logistics: check-in windows, walk-ups, start locations, aid stations,
-- course cutoffs, packet pickup, per-distance notes, and a registration-opens date.

alter table public.events
  add column if not exists entries_open_at timestamptz null;

comment on column public.events.entries_open_at is
  'Optional registration window start. Before this, online entries are blocked and the public page shows "Registration opens ...".';

alter table public.distances
  add column if not exists check_in_opens_at timestamptz null,
  add column if not exists check_in_closes_at timestamptz null,
  add column if not exists allow_walk_ups boolean not null default true,
  add column if not exists walk_up_fee_cents integer null,
  add column if not exists start_location_name text null,
  add column if not exists start_location_address text null,
  add column if not exists start_lat double precision null,
  add column if not exists start_lng double precision null,
  add column if not exists course_cutoff_at timestamptz null,
  add column if not exists packet_pickup_info text null,
  add column if not exists additional_notes text null;

comment on column public.distances.check_in_opens_at is 'Race-day check-in window start (defaults to one hour before gun).';
comment on column public.distances.check_in_closes_at is 'Race-day check-in window end (defaults to gun time).';
comment on column public.distances.allow_walk_ups is 'When true, race-day walk-up entries can be created at the check-in desk.';
comment on column public.distances.walk_up_fee_cents is 'Optional race-day entry fee; null means same as online entry fee.';
comment on column public.distances.start_location_name is 'Start line location when it differs from the event venue (point-to-point races).';
comment on column public.distances.course_cutoff_at is 'On-course final cutoff (distinct from the entry deadline).';
comment on column public.distances.packet_pickup_info is 'Free-text packet pickup details for this distance.';
comment on column public.distances.additional_notes is 'Free-text extra info for this distance shown on the race day sheet.';

create table if not exists public.aid_stations (
  id uuid primary key default gen_random_uuid(),
  distance_id uuid not null references public.distances(id) on delete cascade,
  name text not null,
  mile_marker text null,
  lat double precision null,
  lng double precision null,
  drop_bags boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists aid_stations_distance_id_idx
  on public.aid_stations (distance_id, sort_order);

alter table public.aid_stations enable row level security;

-- Public read (aid stations appear on the public event page); writes go through
-- promoter-authenticated API routes using the service role.
drop policy if exists aid_stations_select_all on public.aid_stations;
create policy aid_stations_select_all
  on public.aid_stations for select
  to anon, authenticated
  using (true);

comment on table public.aid_stations is
  'Aid stations per distance: name, mile marker (free text, e.g. 19/87), optional map pin, drop bags flag.';
