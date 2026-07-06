-- Demo events: full promoter workflow for sales/onboarding previews.
-- No public listing, no results publish, no wallet side effects (enforced in app layer).

alter table public.events
  add column if not exists is_demo boolean not null default false;

create index if not exists events_is_demo_idx
  on public.events (is_demo)
  where is_demo = true;

comment on column public.events.is_demo is
  'Super-admin sandbox race: real tools, no publish/wallet/membership side effects.';
