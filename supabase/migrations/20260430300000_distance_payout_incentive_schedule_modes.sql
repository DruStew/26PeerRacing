-- Per-incentive schedule: auto (band by count of runners in that bucket) vs manual column.
alter table public.distance_payout_settings
  add column if not exists female_incentive_schedule_mode text not null default 'auto'
    check (female_incentive_schedule_mode in ('auto', 'manual')),
  add column if not exists female_incentive_manual_bracket text null,
  add column if not exists military_incentive_schedule_mode text not null default 'auto'
    check (military_incentive_schedule_mode in ('auto', 'manual')),
  add column if not exists military_incentive_manual_bracket text null;

comment on column public.distance_payout_settings.female_incentive_schedule_mode is
  'auto: PR schedule column from female entry count for this distance; manual: use female_incentive_manual_bracket.';
comment on column public.distance_payout_settings.military_incentive_schedule_mode is
  'auto: PR schedule column from military entry count; manual: use military_incentive_manual_bracket.';
