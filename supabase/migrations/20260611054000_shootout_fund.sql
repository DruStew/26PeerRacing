-- Shootout fund: a per-race holding (percentage of net-after-processing, taken
-- BEFORE PR holding) that accumulates across a series to fund the finale's
-- added money. Banked into the ledger when a distance's results publish;
-- reversed on unpublish.

alter table public.distance_payout_settings
  add column if not exists shootout_fraction numeric not null default 0;

comment on column public.distance_payout_settings.shootout_fraction is
  'Fraction of net-after-processing held back for the series shootout fund (taken before PR holding).';

create table if not exists public.shootout_fund_ledger (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  distance_id uuid not null references public.distances(id) on delete cascade,
  promoter_id uuid null,
  fraction numeric not null default 0,
  entry_count integer not null default 0,
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint shootout_fund_ledger_distance_unique unique (distance_id)
);

comment on table public.shootout_fund_ledger is
  'One row per published distance: dollars held back for the series shootout finale. Written/reversed by results publish.';

alter table public.shootout_fund_ledger enable row level security;

-- Fund total is marketing-facing; anyone may read. Writes go through the
-- service role only (publish/unpublish APIs) — no insert/update/delete policies.
drop policy if exists "shootout_fund_ledger_select_all" on public.shootout_fund_ledger;
create policy "shootout_fund_ledger_select_all"
  on public.shootout_fund_ledger for select
  using (true);

notify pgrst, 'reload schema';
