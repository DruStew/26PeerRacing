-- Super Admin role, platform admin RLS helpers, configurable membership tiers.

-- 1. Extend roles enum
alter table public.roles drop constraint if exists roles_role_check;
alter table public.roles add constraint roles_role_check
  check (role in ('runner', 'promoter', 'booth', 'admin', 'super_admin'));

-- 2. Platform role helpers (global scope)
create or replace function public.auth_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.roles r
    where r.user_id = auth.uid()
      and r.role in ('admin', 'super_admin')
      and (
        r.scope_event_id is null
        or r.scope_event_id = '00000000-0000-0000-0000-000000000000'::uuid
      )
  );
$$;

create or replace function public.auth_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.roles r
    where r.user_id = auth.uid()
      and r.role = 'super_admin'
      and (
        r.scope_event_id is null
        or r.scope_event_id = '00000000-0000-0000-0000-000000000000'::uuid
      )
  );
$$;

grant execute on function public.auth_is_platform_admin() to authenticated;
grant execute on function public.auth_is_super_admin() to authenticated;

-- 3. Membership tier configuration (admin-editable)
create table if not exists public.membership_tier_config (
  slug text primary key,
  display_name text not null,
  description text,
  price_cents integer not null default 0 check (price_cents >= 0),
  stripe_price_id text,
  sort_order integer not null default 0,
  rank integer not null default 0,
  is_active boolean not null default true,
  is_paid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.membership_tier_config is
  'Admin-configurable membership tiers (names, prices, Stripe price IDs).';

insert into public.membership_tier_config (
  slug, display_name, description, price_cents, sort_order, rank, is_active, is_paid
) values
  (
    'free',
    'Free',
    'Peer Racing account — limited race access depending on event settings.',
    0,
    0,
    0,
    true,
    false
  ),
  (
    'pr_team',
    'PR-Team',
    'Standard paid membership — most Peer Racing events.',
    5000,
    1,
    1,
    true,
    true
  ),
  (
    'top_tier',
    'Top Tier',
    'Premium membership — full access including premium-only races.',
    25000,
    2,
    2,
    true,
    true
  )
on conflict (slug) do nothing;

-- Relax memberships.tier to reference config slugs
alter table public.memberships drop constraint if exists memberships_tier_check;
alter table public.memberships
  add constraint memberships_tier_fkey
  foreign key (tier) references public.membership_tier_config (slug);

alter table public.membership_tier_config enable row level security;

create policy membership_tier_config_select_public
  on public.membership_tier_config for select
  to public
  using (is_active = true);

create policy membership_tier_config_select_admin
  on public.membership_tier_config for select
  to authenticated
  using (public.auth_is_platform_admin());

create policy membership_tier_config_insert_super_admin
  on public.membership_tier_config for insert
  to authenticated
  with check (public.auth_is_super_admin());

create policy membership_tier_config_update_admin
  on public.membership_tier_config for update
  to authenticated
  using (public.auth_is_platform_admin())
  with check (public.auth_is_platform_admin());

create policy membership_tier_config_delete_super_admin
  on public.membership_tier_config for delete
  to authenticated
  using (public.auth_is_super_admin() and slug <> 'free');

-- 4. Promote drujstew@gmail.com to super_admin (sole super admin at launch)
do $$
declare
  uid uuid;
begin
  select id into uid
  from public.profiles
  where lower(trim(email)) = 'drujstew@gmail.com'
  limit 1;

  if uid is not null then
    delete from public.roles
    where user_id = uid
      and role = 'admin'
      and (
        scope_event_id is null
        or scope_event_id = '00000000-0000-0000-0000-000000000000'::uuid
      );

    insert into public.roles (user_id, role, scope_event_id)
    values (uid, 'super_admin', '00000000-0000-0000-0000-000000000000'::uuid)
    on conflict (user_id, role, scope_event_id) do nothing;
  end if;
end $$;

-- 5. Refresh RLS policies to treat super_admin like admin

-- profiles
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
  on public.profiles for select
  to authenticated
  using (public.auth_is_platform_admin());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.auth_is_platform_admin())
  with check (public.auth_is_platform_admin());

-- roles (privileged role changes require super_admin)
drop policy if exists roles_select_admin on public.roles;
create policy roles_select_admin
  on public.roles for select
  to authenticated
  using (public.auth_is_platform_admin());

drop policy if exists roles_insert_admin on public.roles;
create policy roles_insert_admin
  on public.roles for insert
  to authenticated
  with check (
    public.auth_is_platform_admin()
    and (
      role not in ('admin', 'super_admin')
      or public.auth_is_super_admin()
    )
  );

drop policy if exists roles_update_admin on public.roles;
create policy roles_update_admin
  on public.roles for update
  to authenticated
  using (
    public.auth_is_platform_admin()
    and (
      role not in ('admin', 'super_admin')
      or public.auth_is_super_admin()
    )
  )
  with check (
    public.auth_is_platform_admin()
    and (
      role not in ('admin', 'super_admin')
      or public.auth_is_super_admin()
    )
  );

drop policy if exists roles_delete_admin on public.roles;
create policy roles_delete_admin
  on public.roles for delete
  to authenticated
  using (
    public.auth_is_platform_admin()
    and (
      role not in ('admin', 'super_admin')
      or public.auth_is_super_admin()
    )
  );

-- events
drop policy if exists events_select_admin on public.events;
create policy events_select_admin
  on public.events for select
  to authenticated
  using (public.auth_is_platform_admin());

drop policy if exists events_update_admin on public.events;
create policy events_update_admin
  on public.events for update
  to authenticated
  using (public.auth_is_platform_admin())
  with check (public.auth_is_platform_admin());

drop policy if exists events_delete_admin on public.events;
create policy events_delete_admin
  on public.events for delete
  to authenticated
  using (public.auth_is_platform_admin());

-- distances
drop policy if exists distances_select_manage on public.distances;
create policy distances_select_manage
  on public.distances for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists distances_insert_manage on public.distances;
create policy distances_insert_manage
  on public.distances for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists distances_update_manage on public.distances;
create policy distances_update_manage
  on public.distances for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists distances_delete_manage on public.distances;
create policy distances_delete_manage
  on public.distances for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- sidepots
drop policy if exists sidepots_select_manage on public.sidepots;
create policy sidepots_select_manage
  on public.sidepots for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists sidepots_insert_manage on public.sidepots;
create policy sidepots_insert_manage
  on public.sidepots for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists sidepots_update_manage on public.sidepots;
create policy sidepots_update_manage
  on public.sidepots for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists sidepots_delete_manage on public.sidepots;
create policy sidepots_delete_manage
  on public.sidepots for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- entries
drop policy if exists entries_select_manage on public.entries;
create policy entries_select_manage
  on public.entries for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists entries_update_manage on public.entries;
create policy entries_update_manage
  on public.entries for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- overrides
drop policy if exists overrides_insert_manage on public.overrides;
create policy overrides_insert_manage
  on public.overrides for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = overrides.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- results_raw
drop policy if exists results_raw_insert_manage on public.results_raw;
create policy results_raw_insert_manage
  on public.results_raw for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists results_raw_select_manage on public.results_raw;
create policy results_raw_select_manage
  on public.results_raw for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists results_raw_update_manage on public.results_raw;
create policy results_raw_update_manage
  on public.results_raw for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists results_raw_delete_manage on public.results_raw;
create policy results_raw_delete_manage
  on public.results_raw for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- results
drop policy if exists results_select_manage on public.results;
create policy results_select_manage
  on public.results for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists results_insert_manage on public.results;
create policy results_insert_manage
  on public.results for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists results_update_manage on public.results;
create policy results_update_manage
  on public.results for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists results_delete_manage on public.results;
create policy results_delete_manage
  on public.results for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- badges
drop policy if exists badges_insert_admin on public.badges;
create policy badges_insert_admin
  on public.badges for insert
  to authenticated
  with check (public.auth_is_platform_admin());

drop policy if exists badges_insert_manage on public.badges;
create policy badges_insert_manage
  on public.badges for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = badges.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists badges_delete_manage on public.badges;
create policy badges_delete_manage
  on public.badges for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = badges.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- event_payout_settings
drop policy if exists event_payout_settings_select_manage on public.event_payout_settings;
create policy event_payout_settings_select_manage
  on public.event_payout_settings for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_payout_settings.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists event_payout_settings_insert_manage on public.event_payout_settings;
create policy event_payout_settings_insert_manage
  on public.event_payout_settings for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_payout_settings.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists event_payout_settings_update_manage on public.event_payout_settings;
create policy event_payout_settings_update_manage
  on public.event_payout_settings for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_payout_settings.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_payout_settings.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists event_payout_settings_delete_manage on public.event_payout_settings;
create policy event_payout_settings_delete_manage
  on public.event_payout_settings for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_payout_settings.event_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- distance_payout_settings
drop policy if exists distance_payout_settings_select_manage on public.distance_payout_settings;
create policy distance_payout_settings_select_manage
  on public.distance_payout_settings for select
  to authenticated
  using (
    exists (
      select 1
      from public.distances d
      join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists distance_payout_settings_insert_manage on public.distance_payout_settings;
create policy distance_payout_settings_insert_manage
  on public.distance_payout_settings for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.distances d
      join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists distance_payout_settings_update_manage on public.distance_payout_settings;
create policy distance_payout_settings_update_manage
  on public.distance_payout_settings for update
  to authenticated
  using (
    exists (
      select 1
      from public.distances d
      join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.distances d
      join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

drop policy if exists distance_payout_settings_delete_manage on public.distance_payout_settings;
create policy distance_payout_settings_delete_manage
  on public.distance_payout_settings for delete
  to authenticated
  using (
    exists (
      select 1
      from public.distances d
      join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (e.promoter_id = auth.uid() or public.auth_is_platform_admin())
    )
  );

-- memberships: platform admins may update member tiers
drop policy if exists memberships_update_admin on public.memberships;
create policy memberships_update_admin
  on public.memberships for update
  to authenticated
  using (public.auth_is_platform_admin())
  with check (public.auth_is_platform_admin());

drop policy if exists memberships_select_admin on public.memberships;
create policy memberships_select_admin
  on public.memberships for select
  to authenticated
  using (public.auth_is_platform_admin());

notify pgrst, 'reload schema';
