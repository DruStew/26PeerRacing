create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  email text,
  created_at timestamptz default now()
);

create table if not exists roles (
  user_id uuid references auth.users(id) on delete cascade,
  role text check (role in ('runner', 'promoter', 'booth', 'admin')),
  scope_event_id uuid null,
  created_at timestamptz default now(),
  primary key (user_id, role, scope_event_id)
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references auth.users(id),
  name text not null,
  city text,
  state text,
  timezone text default 'America/Chicago',
  race_date date not null,
  gun_time timestamptz not null,
  pr_cutoff timestamptz not null,
  event_type text not null check (event_type in ('full', 'overlay')),
  status text default 'draft' check (status in ('draft', 'published', 'locked')),
  results_published boolean default false,
  created_at timestamptz default now()
);

create table if not exists distances (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  label text not null,
  start_time timestamptz null
);

create table if not exists sidepots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  name text not null,
  fee_cents int not null,
  enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text default 'inactive' check (status in ('active', 'inactive', 'canceled')),
  provider text null,
  provider_customer_id text null,
  created_at timestamptz default now()
);

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  user_id uuid null references auth.users(id),
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text not null,
  dob date not null,
  sex text not null check (sex in ('male', 'female')),
  bib text null,
  entry_kind text not null check (entry_kind in ('free', 'paid', 'comp')),
  paid_at timestamptz null,
  created_at timestamptz default now(),
  cutoff_snapshot timestamptz not null,
  eligible boolean default true
);

create table if not exists overrides (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  entry_id uuid references entries(id) on delete cascade,
  override_type text not null check (override_type in ('force_through', 'comp')),
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table if not exists results_raw (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  row_json jsonb not null,
  imported_at timestamptz default now()
);

create table if not exists results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  entry_id uuid null references entries(id),
  bib text null,
  first_name text not null,
  last_name text not null,
  finish_time_ms int not null,
  overall_rank int null,
  pr_rank int null,
  team text null,
  team_place int null,
  incentive_1 text null,
  incentive_2 text null,
  incentive_3 text null
);

create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade,
  user_id uuid null references auth.users(id),
  entry_id uuid null references entries(id),
  badge_key text not null,
  badge_title text not null,
  team text null,
  place int null,
  created_at timestamptz default now()
);

create table if not exists wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount_cents int not null,
  source text not null,
  ref_id uuid null,
  created_at timestamptz default now()
);

create index if not exists entries_event_kind_paid_at_idx
  on entries (event_id, entry_kind, paid_at);

create index if not exists entries_event_created_at_idx
  on entries (event_id, created_at);

create index if not exists results_event_team_team_place_idx
  on results (event_id, team, team_place);

create index if not exists badges_user_created_at_idx
  on badges (user_id, created_at);

create index if not exists wallet_ledger_user_created_at_idx
  on wallet_ledger (user_id, created_at);
