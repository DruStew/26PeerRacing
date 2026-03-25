alter table profiles enable row level security;
alter table roles enable row level security;
alter table events enable row level security;
alter table distances enable row level security;
alter table sidepots enable row level security;
alter table memberships enable row level security;
alter table entries enable row level security;
alter table overrides enable row level security;
alter table results_raw enable row level security;
alter table results enable row level security;
alter table badges enable row level security;
alter table wallet_ledger enable row level security;

create policy profiles_select_own
  on profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_update_own
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_select_admin
  on profiles for select
  to authenticated
  using (
    exists (
      select 1 from roles
      where roles.user_id = auth.uid()
        and roles.role = 'admin'
    )
  );

create policy profiles_update_admin
  on profiles for update
  to authenticated
  using (
    exists (
      select 1 from roles
      where roles.user_id = auth.uid()
        and roles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from roles
      where roles.user_id = auth.uid()
        and roles.role = 'admin'
    )
  );

create policy roles_select_own
  on roles for select
  to authenticated
  using (user_id = auth.uid());

create policy roles_select_admin
  on roles for select
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );

create policy roles_insert_admin
  on roles for insert
  to authenticated
  with check (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );

create policy roles_update_admin
  on roles for update
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );

create policy roles_delete_admin
  on roles for delete
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );

create policy events_select_published
  on events for select
  to public
  using (status = 'published');

create policy events_select_promoter
  on events for select
  to authenticated
  using (promoter_id = auth.uid());

create policy events_select_admin
  on events for select
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );

create policy events_update_promoter
  on events for update
  to authenticated
  using (promoter_id = auth.uid())
  with check (promoter_id = auth.uid());

create policy events_update_admin
  on events for update
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );

create policy distances_select_public
  on distances for select
  to public
  using (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and e.status = 'published'
    )
  );

create policy distances_select_manage
  on distances for select
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy distances_insert_manage
  on distances for insert
  to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy distances_update_manage
  on distances for update
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy distances_delete_manage
  on distances for delete
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = distances.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy sidepots_select_public
  on sidepots for select
  to public
  using (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and e.status = 'published'
    )
  );

create policy sidepots_select_manage
  on sidepots for select
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy sidepots_insert_manage
  on sidepots for insert
  to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy sidepots_update_manage
  on sidepots for update
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy sidepots_delete_manage
  on sidepots for delete
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = sidepots.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy entries_insert_public
  on entries for insert
  to public
  with check (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and now() < e.pr_cutoff
        and entries.cutoff_snapshot = e.pr_cutoff
    )
  );

create policy entries_select_own
  on entries for select
  to authenticated
  using (user_id = auth.uid());

create policy entries_select_manage
  on entries for select
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy entries_update_manage
  on entries for update
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy overrides_insert_manage
  on overrides for insert
  to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = overrides.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy results_raw_insert_manage
  on results_raw for insert
  to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy results_select_public
  on results for select
  to public
  using (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and e.results_published = true
    )
  );

create policy results_select_manage
  on results for select
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy results_insert_manage
  on results for insert
  to authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy results_update_manage
  on results for update
  to authenticated
  using (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  )
  with check (
    exists (
      select 1 from events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from roles r
            where r.user_id = auth.uid()
              and r.role = 'admin'
          ))
    )
  );

create policy badges_select_own
  on badges for select
  to authenticated
  using (user_id = auth.uid());

create policy badges_select_public
  on badges for select
  to public
  using (
    exists (
      select 1 from events e
      where e.id = badges.event_id
        and e.results_published = true
    )
  );

create policy badges_insert_admin
  on badges for insert
  to authenticated
  with check (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );

create policy wallet_ledger_select_own
  on wallet_ledger for select
  to authenticated
  using (user_id = auth.uid());

create policy wallet_ledger_insert_admin
  on wallet_ledger for insert
  to authenticated
  with check (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );
