-- Promoter-facing race day info (parking, lodging, start lines, aid stations, etc.).

alter table public.events
  add column if not exists race_day_notes text null;

comment on column public.events.race_day_notes is
  'Free-form race day details for runners: parking, hotels, camping, start/finish, aid stations, links, etc.';

notify pgrst, 'reload schema';
