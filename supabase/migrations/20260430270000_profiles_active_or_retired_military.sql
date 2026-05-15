-- Self-reported active or retired military status for incentive payouts and reporting (alongside sex-based divisions).
alter table public.profiles
  add column if not exists active_or_retired_military boolean null;

comment on column public.profiles.active_or_retired_military is
  'Yes/no: runner is active or retired military. Null = not collected yet; app requires a value before race entry.';
