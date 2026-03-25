-- =============================================================================
-- APPLY MEMBERSHIP SCHEMA – run once in Supabase SQL Editor if you see
-- "Could not find the 'membership_end_at' column of 'memberships' in the schema cache"
-- (Means the membership migrations haven't been applied to this project.)
-- =============================================================================

-- 1. Memberships: add new columns
alter table memberships
  add column if not exists id uuid unique default gen_random_uuid(),
  add column if not exists membership_start_at timestamptz null,
  add column if not exists membership_end_at timestamptz null,
  add column if not exists renewal_count integer not null default 0,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists welcome_shown_at timestamptz null;

alter table memberships drop constraint if exists memberships_status_check;
alter table memberships add constraint memberships_status_check
  check (status in ('active', 'inactive', 'canceled', 'expired'));

update memberships
set
  membership_start_at = coalesce(membership_start_at, created_at),
  membership_end_at = coalesce(membership_end_at, coalesce(created_at, now()) + interval '1 year'),
  updated_at = now()
where membership_start_at is null or membership_end_at is null;

alter table memberships alter column membership_start_at set default now();
alter table memberships alter column membership_end_at set default (now() + interval '1 year');

-- 2. Membership benefits table (if not exists)
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

create index if not exists membership_benefits_user_type_idx on membership_benefits (user_id, benefit_type);
alter table membership_benefits enable row level security;

drop policy if exists membership_benefits_select_own on membership_benefits;
create policy membership_benefits_select_own on membership_benefits for select to authenticated using (user_id = auth.uid());
drop policy if exists membership_benefits_insert_own on membership_benefits;
create policy membership_benefits_insert_own on membership_benefits for insert to authenticated with check (user_id = auth.uid());
drop policy if exists membership_benefits_update_own on membership_benefits;
create policy membership_benefits_update_own on membership_benefits for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Memberships RLS (select/update/insert own)
drop policy if exists memberships_select_own on memberships;
create policy memberships_select_own on memberships for select to authenticated using (user_id = auth.uid());
drop policy if exists memberships_update_own on memberships;
create policy memberships_update_own on memberships for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists memberships_insert_trigger on memberships;
create policy memberships_insert_trigger on memberships for insert to authenticated with check (user_id = auth.uid());

-- =============================================================================
-- After this, reload the app and try Renew again. If you use Supabase CLI
-- migrations, prefer: supabase db push (so this is tracked).
-- =============================================================================
