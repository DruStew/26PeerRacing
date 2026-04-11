-- Holds validated race-entry selections between Checkout creation and webhook fulfillment.
create table if not exists public.stripe_pending_race_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz null
);

create index if not exists stripe_pending_race_entries_user_idx
  on public.stripe_pending_race_entries (user_id);

create index if not exists stripe_pending_race_entries_unfulfilled_idx
  on public.stripe_pending_race_entries (created_at)
  where fulfilled_at is null;

alter table public.stripe_pending_race_entries enable row level security;

create policy "Users insert own pending race checkout"
  on public.stripe_pending_race_entries for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users select own pending race checkout"
  on public.stripe_pending_race_entries for select to authenticated
  using (auth.uid() = user_id);
