-- PEER RACING – AUTH + ENTRY ARCHITECTURE UPDATE (v1)
-- Schema changes only. RLS and app logic updated separately.

-- 1. PROFILES: required fields for profile completion (First, Last, DOB, Sex, Phone, Email)
alter table profiles
  add column if not exists dob date null,
  add column if not exists sex text null check (sex in ('male', 'female'));

comment on column profiles.dob is 'Date of birth; required for profile completion before entry.';
comment on column profiles.sex is 'Male/Female; required for profile completion before entry.';

-- 2. ENTRIES: user_id required for new entries; duplicate prevention; pacer fields
-- Allow user_id to remain nullable for legacy rows; app enforces NOT NULL on insert.
create unique index if not exists entries_event_distance_user_unique
  on entries (event_id, distance_id, user_id)
  where user_id is not null and distance_id is not null;

comment on index entries_event_distance_user_unique is 'One entry per user per distance per event (prevents duplicate entry).';

alter table entries
  add column if not exists pacer_user_id uuid null references auth.users(id) on delete set null,
  add column if not exists pacer_status text null check (pacer_status in ('requested', 'accepted', 'declined', 'canceled'));

comment on column entries.pacer_user_id is 'Verified PR member requested as pacer for this entry.';
comment on column entries.pacer_status is 'Pacer request state: requested | accepted | declined | canceled.';

-- 3. DISTANCES: promoter controls for pacer (per distance)
alter table distances
  add column if not exists allow_pacers boolean not null default false,
  add column if not exists pacer_fee_cents integer not null default 0;

comment on column distances.allow_pacers is 'Promoter: allow runners to request a pacer for this distance.';
comment on column distances.pacer_fee_cents is 'Pacer fee charged to runner at entry (0 allowed).';
