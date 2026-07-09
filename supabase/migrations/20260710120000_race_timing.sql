-- Camera-based race timing v1 ("your bib is your chip").
--
-- Physical model: promoters get a roll of printed marker stickers (ArUco
-- fiducial tags). At kiosk check-in a sticker is scanned and bound to an
-- entrant. A phone at the finish line records continuously, detects tags
-- live, and proposes finish crossings; the promoter confirms them in a
-- review UI, which writes provisional times into results_raw (the same
-- pipeline manual entry and CSV import use today).

-- ---------------------------------------------------------------------------
-- Tag bindings: one physical sticker (tag_id) per entrant per event
-- ---------------------------------------------------------------------------

create table if not exists public.timing_tags (
  event_id uuid not null references public.events (id) on delete cascade,
  tag_id integer not null check (tag_id >= 0),
  entry_id uuid not null references public.entries (id) on delete cascade,
  -- Marker dictionary the tag was printed from (future-proofing for larger sets).
  tag_family text not null default 'ARUCO_MIP_36h12',
  bound_at timestamptz not null default now(),
  -- Who bound it: promoter user id, or null when bound from a kiosk terminal.
  bound_by uuid null references auth.users (id) on delete set null,
  primary key (event_id, tag_id)
);

comment on table public.timing_tags is
  'Timing sticker (fiducial marker) bound to an entrant at check-in. Tag ids are unique per event; the same physical roll can serve many events.';

-- One tag per entrant (rebinding replaces the old row via the API).
create unique index if not exists timing_tags_entry_uidx
  on public.timing_tags (event_id, entry_id);

alter table public.timing_tags enable row level security;
-- Reads/writes via service role only (promoter/kiosk APIs gate access).

-- ---------------------------------------------------------------------------
-- Capture sessions: one phone recording at a finish line
-- ---------------------------------------------------------------------------

create table if not exists public.timing_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  label text not null default 'Finish line',
  status text not null default 'active' check (status in ('active', 'ended')),
  -- Device clock minus server clock, measured at session start (milliseconds).
  clock_offset_ms integer null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  ended_at timestamptz null
);

comment on table public.timing_sessions is
  'One finish-cam recording session. Gun marks and finish events hang off a session.';

create index if not exists timing_sessions_event_idx
  on public.timing_sessions (event_id, created_at desc);

alter table public.timing_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Gun marks: official start per distance within a session
-- ---------------------------------------------------------------------------

create table if not exists public.timing_gun_marks (
  session_id uuid not null references public.timing_sessions (id) on delete cascade,
  distance_id uuid not null references public.distances (id) on delete cascade,
  gun_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (session_id, distance_id)
);

comment on table public.timing_gun_marks is
  'GUN button press per distance: the official start moment on the session clock. Re-firing updates the row.';

alter table public.timing_gun_marks enable row level security;

-- ---------------------------------------------------------------------------
-- Finish events: proposed + confirmed line crossings
-- ---------------------------------------------------------------------------

create table if not exists public.timing_finish_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.timing_sessions (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  distance_id uuid null references public.distances (id) on delete set null,
  entry_id uuid null references public.entries (id) on delete set null,
  tag_id integer null,
  -- Absolute crossing moment (server clock; device offset already applied).
  crossed_at timestamptz not null,
  -- Elapsed from the distance gun mark, computed at confirmation.
  elapsed_ms bigint null check (elapsed_ms is null or elapsed_ms > 0),
  source text not null check (source in ('tag', 'mark', 'motion', 'manual')),
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'dismissed')),
  -- Detector confidence / dedupe key from the capture page (free-form).
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.timing_finish_events is
  'Finish-line crossings from the camera: tag detections, volunteer MARK taps, or manual review additions. Confirmed events write provisional times into results_raw.';

create index if not exists timing_finish_events_session_idx
  on public.timing_finish_events (session_id, crossed_at);
create index if not exists timing_finish_events_event_idx
  on public.timing_finish_events (event_id, status, crossed_at);

-- One live event per tag per session: the capture page re-detects the same
-- runner many times; the API dedupes onto this key.
create unique index if not exists timing_finish_events_tag_uidx
  on public.timing_finish_events (session_id, tag_id)
  where tag_id is not null and status <> 'dismissed';

alter table public.timing_finish_events enable row level security;

notify pgrst, 'reload schema';
