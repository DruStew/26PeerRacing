-- One unified race map per distance: start/finish pins with runner notes,
-- notes on aid stations, and map locations + notes for QR checkpoints.
-- Everything here is additive; no existing data changes.

alter table public.distances
  add column if not exists start_note text null,
  add column if not exists finish_location_name text null,
  add column if not exists finish_lat double precision null,
  add column if not exists finish_lng double precision null,
  add column if not exists finish_note text null;

comment on column public.distances.start_note is
  'Promoter note to runners about the start line (shown on the public race map pin).';
comment on column public.distances.finish_location_name is
  'Finish line label when the finish differs from the start (point-to-point races).';
comment on column public.distances.finish_lat is
  'Finish line pin; null when the finish is the start/venue.';
comment on column public.distances.finish_note is
  'Promoter note to runners about the finish line.';

alter table public.aid_stations
  add column if not exists note text null;

comment on column public.aid_stations.note is
  'Promoter note to runners about this aid station (shown on the public race map pin).';

alter table public.qr_checkpoints
  add column if not exists lat double precision null,
  add column if not exists lng double precision null,
  add column if not exists note text null;

comment on column public.qr_checkpoints.lat is
  'Optional map pin marking where this QR sign is physically placed on the course.';
comment on column public.qr_checkpoints.note is
  'Promoter note to runners about this checkpoint (shown on the public race map pin).';
