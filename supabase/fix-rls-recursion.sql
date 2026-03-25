-- Fix: "infinite recursion detected in policy for relation roles"
-- Cause: policies on roles (and others) use "exists (select 1 from roles ...)" which
--        re-triggers RLS on roles. Fix by using a SECURITY DEFINER function that
--        reads roles without going through RLS.

-- 1. Create helper that runs with definer rights (no RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- 2. Allow promoters to create events (required for Create Event flow)
create policy events_insert_promoter on events for insert to authenticated
  with check (promoter_id = auth.uid());

-- 3. Drop and recreate all policies that used the recursive "exists (select from roles)" check

-- ----- roles -----
drop policy if exists roles_select_admin on roles;
create policy roles_select_admin on roles for select to authenticated
  using (is_admin());

drop policy if exists roles_insert_admin on roles;
create policy roles_insert_admin on roles for insert to authenticated
  with check (is_admin());

drop policy if exists roles_update_admin on roles;
create policy roles_update_admin on roles for update to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists roles_delete_admin on roles;
create policy roles_delete_admin on roles for delete to authenticated
  using (is_admin());

-- ----- profiles -----
drop policy if exists profiles_select_admin on profiles;
create policy profiles_select_admin on profiles for select to authenticated
  using (is_admin());

drop policy if exists profiles_update_admin on profiles;
create policy profiles_update_admin on profiles for update to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- events -----
drop policy if exists events_select_admin on events;
create policy events_select_admin on events for select to authenticated
  using (is_admin());

drop policy if exists events_update_admin on events;
create policy events_update_admin on events for update to authenticated
  using (is_admin())
  with check (is_admin());

-- ----- distances -----
drop policy if exists distances_select_manage on distances;
create policy distances_select_manage on distances for select to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists distances_insert_manage on distances;
create policy distances_insert_manage on distances for insert to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists distances_update_manage on distances;
create policy distances_update_manage on distances for update to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists distances_delete_manage on distances;
create policy distances_delete_manage on distances for delete to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

-- ----- sidepots -----
drop policy if exists sidepots_select_manage on sidepots;
create policy sidepots_select_manage on sidepots for select to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists sidepots_insert_manage on sidepots;
create policy sidepots_insert_manage on sidepots for insert to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists sidepots_update_manage on sidepots;
create policy sidepots_update_manage on sidepots for update to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists sidepots_delete_manage on sidepots;
create policy sidepots_delete_manage on sidepots for delete to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

-- ----- entries -----
drop policy if exists entries_select_manage on entries;
create policy entries_select_manage on entries for select to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists entries_update_manage on entries;
create policy entries_update_manage on entries for update to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

-- ----- overrides -----
drop policy if exists overrides_insert_manage on overrides;
create policy overrides_insert_manage on overrides for insert to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = overrides.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

-- ----- results_raw -----
drop policy if exists results_raw_insert_manage on results_raw;
create policy results_raw_insert_manage on results_raw for insert to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

-- ----- results -----
drop policy if exists results_select_manage on results;
create policy results_select_manage on results for select to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists results_insert_manage on results;
create policy results_insert_manage on results for insert to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists results_update_manage on results;
create policy results_update_manage on results for update to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

-- ----- badges -----
drop policy if exists badges_insert_admin on badges;
create policy badges_insert_admin on badges for insert to authenticated
  with check (is_admin());

-- ----- wallet_ledger -----
drop policy if exists wallet_ledger_insert_admin on wallet_ledger;
create policy wallet_ledger_insert_admin on wallet_ledger for insert to authenticated
  with check (is_admin());
