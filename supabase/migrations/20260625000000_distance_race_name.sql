-- Optional individual race name within a multi-race event (e.g. "Kids Run").
-- label remains the required race distance (e.g. "1 mile", "5K").

alter table public.distances
  add column if not exists race_name text null;

comment on column public.distances.race_name is
  'Optional individual race name within an event (e.g. Kids Run). Distinct from label (distance).';

comment on column public.distances.label is
  'Required race distance label (e.g. 1 mile, 5K, 50 miler).';
