-- Female / military incentive dollars taken from the racers pot (entry-fee slice after PR holding) before true added money is combined into the contestant pool.
alter table public.distance_payout_settings
  add column if not exists female_incentive_cents integer not null default 0 check (female_incentive_cents >= 0),
  add column if not exists military_incentive_cents integer not null default 0 check (military_incentive_cents >= 0);

comment on column public.distance_payout_settings.female_incentive_cents is
  'Incentive pool for female division payoffs; drawn from racers pot before contestant pool.';
comment on column public.distance_payout_settings.military_incentive_cents is
  'Incentive pool for military payoffs; drawn from racers pot before contestant pool.';
