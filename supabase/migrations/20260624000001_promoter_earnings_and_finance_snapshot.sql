-- Promoter event earnings wallet category + per-distance financial snapshot for admin reporting.

alter table public.wallet_ledger drop constraint if exists wallet_ledger_category_check;

alter table public.wallet_ledger add constraint wallet_ledger_category_check
  check (category in (
    'entry_withdrawal_credit',
    'race_payout',
    'promoter_event_earnings',
    'membership_credit',
    'bank_withdrawal',
    'entry_payment_from_wallet',
    'adjustment'
  ));

comment on column public.wallet_ledger.category is
  'race_payout = racer winnings; promoter_event_earnings = producer cut from PR holding (never counts as racer winnings).';

-- One promoter credit per published distance (idempotency via metadata.distance_id).
create unique index if not exists wallet_ledger_promoter_distance_uidx
  on public.wallet_ledger ((metadata->>'distance_id'))
  where category = 'promoter_event_earnings' and (metadata->>'distance_id') is not null;

-- Snapshot of the payout waterfall at publish time — source of truth for admin finance views.
create table if not exists public.distance_financial_snapshots (
  distance_id uuid primary key references public.distances(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  promoter_id uuid null references auth.users(id) on delete set null,
  published_at timestamptz not null,
  entry_count integer not null default 0,
  gross_pot_cents bigint not null default 0,
  processing_fee_cents bigint not null default 0,
  shootout_fund_cents bigint not null default 0,
  pr_holding_cents bigint not null default 0,
  producer_cents bigint not null default 0,
  peer_racing_org_cents bigint not null default 0,
  racers_pot_cents bigint not null default 0,
  total_runner_payout_cents bigint not null default 0,
  checks_paid_count integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.distance_financial_snapshots is
  'Immutable-ish snapshot written when a distance publishes; deleted on unpublish. Powers admin finance reporting.';

create index if not exists distance_financial_snapshots_event_idx
  on public.distance_financial_snapshots (event_id);

create index if not exists distance_financial_snapshots_published_at_idx
  on public.distance_financial_snapshots (published_at desc);

alter table public.distance_financial_snapshots enable row level security;

-- Marketing/admin reads via service role; no authenticated policies (internal only).
drop policy if exists distance_financial_snapshots_select_admin on public.distance_financial_snapshots;

notify pgrst, 'reload schema';
