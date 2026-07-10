-- Race Control: stoppable race clocks + DNF marking.
--
-- The gun starts a distance's clock; Race Control can now also STOP it once
-- the last runner is in (or the course closes). Runners still out when the
-- clock stops — or who drop mid-race — are marked DNF so the outstanding
-- roster reaches zero and the race can be closed out cleanly.

-- ---------------------------------------------------------------------------
-- Clock state per distance (race-level, independent of capture sessions)
-- ---------------------------------------------------------------------------

create table if not exists public.timing_race_clocks (
  event_id uuid not null references public.events (id) on delete cascade,
  distance_id uuid not null references public.distances (id) on delete cascade,
  stopped_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (event_id, distance_id)
);

comment on table public.timing_race_clocks is
  'Race-clock state per distance. stopped_at set = clock stopped/course closed; cleared = running again. Guns live in timing_gun_marks.';

alter table public.timing_race_clocks enable row level security;
-- Reads/writes via service role only (timing APIs gate access).

-- ---------------------------------------------------------------------------
-- DNF marks
-- ---------------------------------------------------------------------------

create table if not exists public.timing_dnf (
  event_id uuid not null references public.events (id) on delete cascade,
  entry_id uuid not null references public.entries (id) on delete cascade,
  distance_id uuid null references public.distances (id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (event_id, entry_id)
);

comment on table public.timing_dnf is
  'Did-not-finish marks from Race Control. Removing the row un-DNFs the runner.';

alter table public.timing_dnf enable row level security;

notify pgrst, 'reload schema';
