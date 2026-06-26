-- Three membership tiers + per-distance entry eligibility.

-- 1. Membership tier on memberships
alter table public.memberships
  add column if not exists tier text not null default 'free'
    check (tier in ('free', 'pr_team', 'top_tier'));

alter table public.memberships
  add column if not exists stripe_subscription_id text null;

comment on column public.memberships.tier is
  'free = free PR account; pr_team = $50/yr standard; top_tier = $250/yr premium.';

create unique index if not exists memberships_stripe_subscription_uidx
  on public.memberships (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- Grandfather all existing members as PR-Team (pre-launch test accounts).
update public.memberships
set tier = 'pr_team'
where tier = 'free';

-- 2. New signups: free tier, no artificial expiry
create or replace function public.handle_new_user_create_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memberships (
    user_id,
    status,
    tier,
    membership_start_at,
    membership_end_at,
    renewal_count,
    updated_at
  )
  values (
    new.id,
    'active',
    'free',
    now(),
    null,
    0,
    now()
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 3. Per-distance: who may enter
alter table public.distances
  add column if not exists allow_free_tier boolean not null default false;

alter table public.distances
  add column if not exists allow_pr_team_tier boolean not null default true;

alter table public.distances
  add column if not exists allow_top_tier boolean not null default true;

comment on column public.distances.allow_free_tier is
  'When true, Free tier members may enter. Checking this in the UI typically enables all tiers.';

comment on column public.distances.allow_pr_team_tier is
  'When true, PR-Team ($50) members may enter. Top Tier always satisfies this when allowed.';

comment on column public.distances.allow_top_tier is
  'When true, Top Tier ($250) members may enter. If only this is set, PR-Team cannot enter.';
