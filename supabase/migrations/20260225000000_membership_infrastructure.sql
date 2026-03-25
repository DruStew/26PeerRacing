-- Peer Racing Membership infrastructure.
-- Extend existing memberships table; add membership_benefits. Do NOT remove existing columns.

-- 1. Memberships: add columns (keep user_id as PK; add id for future reference)
alter table memberships
  add column if not exists id uuid unique default gen_random_uuid(),
  add column if not exists membership_start_at timestamptz null,
  add column if not exists membership_end_at timestamptz null,
  add column if not exists renewal_count integer not null default 0,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists welcome_shown_at timestamptz null;

-- Allow 'expired' in status (keep existing values)
alter table memberships drop constraint if exists memberships_status_check;
alter table memberships add constraint memberships_status_check
  check (status in ('active', 'inactive', 'canceled', 'expired'));

-- New rows default to active; backfill existing rows
update memberships
set
  membership_start_at = coalesce(membership_start_at, created_at),
  membership_end_at = coalesce(membership_end_at, coalesce(created_at, now()) + interval '1 year'),
  updated_at = now()
where membership_start_at is null or membership_end_at is null;

-- Make columns not null for future inserts (after backfill)
alter table memberships alter column membership_start_at set default now();
alter table memberships alter column membership_end_at set default (now() + interval '1 year');

comment on column memberships.membership_start_at is 'Start of current membership period.';
comment on column memberships.membership_end_at is 'End of current period; renew extends this.';
comment on column memberships.renewal_count is 'Number of renewals.';

-- 2. Membership benefits (birthday credit, etc.)
create table if not exists membership_benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  benefit_type text not null check (benefit_type in ('birthday_credit')),
  total_amount_cents integer not null,
  remaining_amount_cents integer not null,
  available_from timestamptz not null,
  expires_at timestamptz not null,
  status text not null check (status in ('available', 'partially_used', 'used', 'expired')),
  membership_year_reference timestamptz not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table membership_benefits is 'Per-membership-year benefits (e.g. birthday credit). One credit per membership year.';
comment on column membership_benefits.membership_year_reference is 'End of membership period this benefit belongs to.';

create index if not exists membership_benefits_user_type_idx on membership_benefits (user_id, benefit_type);

alter table membership_benefits enable row level security;

-- RLS: users see own benefits; app updates remaining/status at checkout
drop policy if exists membership_benefits_select_own on membership_benefits;
create policy membership_benefits_select_own on membership_benefits for select to authenticated
  using (user_id = auth.uid());

drop policy if exists membership_benefits_insert_own on membership_benefits;
create policy membership_benefits_insert_own on membership_benefits for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists membership_benefits_update_own on membership_benefits;
create policy membership_benefits_update_own on membership_benefits for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Memberships: ensure app can read/update own (for renewal and gate)
drop policy if exists memberships_select_own on memberships;
create policy memberships_select_own on memberships for select to authenticated
  using (user_id = auth.uid());

drop policy if exists memberships_update_own on memberships;
create policy memberships_update_own on memberships for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
