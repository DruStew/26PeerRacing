-- Physical prize configuration, published award snapshots, and private fulfillment.
-- Existing cash payout behavior remains the default for every distance.

alter table public.distance_payout_settings
  add column if not exists cash_payouts_enabled boolean not null default true;

create table if not exists public.distance_prize_settings (
  distance_id uuid primary key references public.distances(id) on delete cascade,
  current_config_id uuid not null default gen_random_uuid(),
  main_prizes_enabled boolean not null default false,
  female_prizes_enabled boolean not null default false,
  military_prizes_enabled boolean not null default false,
  show_individual_retail_values boolean not null default false,
  show_total_award_value boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.distance_prize_rules (
  id uuid primary key default gen_random_uuid(),
  distance_id uuid not null references public.distances(id) on delete cascade,
  config_id uuid not null,
  category text not null check (category in ('main', 'female', 'military')),
  -- NULL means the shared default for every division. A named division replaces
  -- the shared prizes for that category/place in that division.
  division text null,
  place integer not null check (place between 1 and 12),
  sort_order integer not null default 0,
  prize_name text not null check (length(trim(prize_name)) between 1 and 160),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  retail_value_cents integer not null default 0 check (retail_value_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists distance_prize_rules_active_idx
  on public.distance_prize_rules(distance_id, config_id, category, division, place, sort_order);

create table if not exists public.published_prize_awards (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.results(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  distance_id uuid not null references public.distances(id) on delete cascade,
  category text not null check (category in ('main', 'female', 'military')),
  division text not null,
  place integer not null check (place between 1 and 12),
  award_order integer not null default 0,
  prize_name text not null,
  retail_value_cents integer not null default 0 check (retail_value_cents >= 0),
  show_retail_value boolean not null default false,
  show_total_award_value boolean not null default true,
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists published_prize_awards_result_idx
  on public.published_prize_awards(result_id, category, place);
create index if not exists published_prize_awards_distance_idx
  on public.published_prize_awards(distance_id);

-- Cost and pickup details are deliberately separate from the publicly readable
-- award snapshot so internal P&L and fulfillment notes can never leak via RLS.
create table if not exists public.prize_award_fulfillment (
  award_id uuid primary key references public.published_prize_awards(id) on delete cascade,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  status text not null default 'awaiting_pickup'
    check (status in ('awaiting_pickup', 'picked_up', 'shipped', 'delivered', 'waived', 'forfeited')),
  fulfilled_at timestamptz null,
  fulfilled_by uuid null references auth.users(id) on delete set null,
  note text null,
  updated_at timestamptz not null default now()
);

alter table public.distance_financial_snapshots
  add column if not exists prize_cost_cents bigint not null default 0,
  add column if not exists prize_retail_value_cents bigint not null default 0,
  add column if not exists prize_award_count integer not null default 0;

alter table public.distance_prize_settings enable row level security;
alter table public.distance_prize_rules enable row level security;
alter table public.published_prize_awards enable row level security;
alter table public.prize_award_fulfillment enable row level security;

create policy distance_prize_settings_manage on public.distance_prize_settings
  for all to authenticated
  using (exists (
    select 1 from public.distances d join public.events e on e.id = d.event_id
    where d.id = distance_prize_settings.distance_id
      and (e.promoter_id = auth.uid() or exists (
        select 1 from public.roles r where r.user_id = auth.uid() and r.role = 'admin'
      ))
  ))
  with check (exists (
    select 1 from public.distances d join public.events e on e.id = d.event_id
    where d.id = distance_prize_settings.distance_id
      and (e.promoter_id = auth.uid() or exists (
        select 1 from public.roles r where r.user_id = auth.uid() and r.role = 'admin'
      ))
  ));

create policy distance_prize_rules_manage on public.distance_prize_rules
  for all to authenticated
  using (exists (
    select 1 from public.distances d join public.events e on e.id = d.event_id
    where d.id = distance_prize_rules.distance_id
      and (e.promoter_id = auth.uid() or exists (
        select 1 from public.roles r where r.user_id = auth.uid() and r.role = 'admin'
      ))
  ))
  with check (exists (
    select 1 from public.distances d join public.events e on e.id = d.event_id
    where d.id = distance_prize_rules.distance_id
      and (e.promoter_id = auth.uid() or exists (
        select 1 from public.roles r where r.user_id = auth.uid() and r.role = 'admin'
      ))
  ));

create policy published_prize_awards_public_read on public.published_prize_awards
  for select to public
  using (exists (
    select 1 from public.results r where r.id = published_prize_awards.result_id and r.published = true
  ));

-- Fulfillment is accessed through promoter-only server endpoints using the
-- service role. No client-facing policy is intentionally defined.

notify pgrst, 'reload schema';
