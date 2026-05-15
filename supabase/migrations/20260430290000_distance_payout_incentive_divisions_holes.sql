-- How female / military incentive pools are split across Peer Team divisions and schedule holes (same weights as main race).
alter table public.distance_payout_settings
  add column if not exists female_incentive_division_count integer not null default 1
    check (female_incentive_division_count >= 1 and female_incentive_division_count <= 5),
  add column if not exists female_incentive_places_to_pay integer not null default 12
    check (female_incentive_places_to_pay >= 1 and female_incentive_places_to_pay <= 12),
  add column if not exists military_incentive_division_count integer not null default 1
    check (military_incentive_division_count >= 1 and military_incentive_division_count <= 5),
  add column if not exists military_incentive_places_to_pay integer not null default 12
    check (military_incentive_places_to_pay >= 1 and military_incentive_places_to_pay <= 12);

comment on column public.distance_payout_settings.female_incentive_division_count is
  'Peer Team divisions (1–5) splitting the female incentive pool only.';
comment on column public.distance_payout_settings.female_incentive_places_to_pay is
  'Schedule holes (1–12) per division for female incentive pool.';
comment on column public.distance_payout_settings.military_incentive_division_count is
  'Peer Team divisions (1–5) splitting the military incentive pool only.';
comment on column public.distance_payout_settings.military_incentive_places_to_pay is
  'Schedule holes (1–12) per division for military incentive pool.';
