-- Race-day kiosk: daily codes + terminal sessions (service role from Next.js only).

create table if not exists public.event_kiosk (
  event_id uuid primary key references public.events (id) on delete cascade,
  codes_for_local_date date not null,
  generation_version int not null default 1,
  updated_at timestamptz not null default now()
);

comment on table public.event_kiosk is 'Kiosk code generation version and local date anchor; codes derived in app via HMAC.';

create table if not exists public.event_kiosk_terminal (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  terminal_index int not null,
  generation_version int not null,
  bound_local_date date not null,
  session_token_digest text not null,
  signed_off_at timestamptz null,
  last_heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (event_id, terminal_index)
);

create index if not exists event_kiosk_terminal_event_idx
  on public.event_kiosk_terminal (event_id);

comment on table public.event_kiosk_terminal is 'Check-in tablets: T1..Tn; session_token_digest validates httpOnly cookie.';

alter table public.event_kiosk enable row level security;
alter table public.event_kiosk_terminal enable row level security;
