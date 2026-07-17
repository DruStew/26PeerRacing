-- Fixed marketing payout snapshots and guaranteed-cash payout mode.
-- Marketing assumptions are deliberately separate from race-day eligible counts.

alter table public.distance_payout_settings
  add column if not exists cash_payout_mode text not null default 'entry_based'
    check (cash_payout_mode in ('entry_based', 'guaranteed')),
  add column if not exists guaranteed_cash_payout_cents integer not null default 0
    check (guaranteed_cash_payout_cents >= 0),
  add column if not exists marketing_entry_count integer null
    check (marketing_entry_count is null or marketing_entry_count >= 0),
  add column if not exists marketing_entry_fee_cents integer null
    check (marketing_entry_fee_cents is null or marketing_entry_fee_cents >= 0),
  add column if not exists marketing_female_entry_count integer null
    check (marketing_female_entry_count is null or marketing_female_entry_count >= 0),
  add column if not exists marketing_military_entry_count integer null
    check (marketing_military_entry_count is null or marketing_military_entry_count >= 0);

-- Preserve existing producer models as marketing assumptions. Final publishing
-- no longer consumes these legacy override columns.
update public.distance_payout_settings
set
  marketing_entry_count = coalesce(marketing_entry_count, entry_count_override),
  marketing_entry_fee_cents = coalesce(marketing_entry_fee_cents, entry_fee_cents_override)
where entry_count_override is not null or entry_fee_cents_override is not null;

alter table public.distance_prize_settings
  add column if not exists public_awards_display text not null default 'none'
    check (public_awards_display in ('none', 'cash', 'prizes', 'both'));

alter table public.distance_financial_snapshots
  add column if not exists cash_payout_mode text not null default 'entry_based',
  add column if not exists guaranteed_cash_payout_cents bigint not null default 0,
  add column if not exists company_funded_cash_shortfall_cents bigint not null default 0;

notify pgrst, 'reload schema';
