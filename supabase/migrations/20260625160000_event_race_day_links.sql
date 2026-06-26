-- Labeled race-day links (parking, camping, hotels, etc.) shown as buttons on public event pages.

alter table public.events
  add column if not exists race_day_links jsonb not null default '[]'::jsonb;

comment on column public.events.race_day_links is
  'Array of {label, url} objects for race-day resource links shown below race_day_notes.';

notify pgrst, 'reload schema';
