drop policy if exists events_update_promoter on events;

create policy events_insert_promoter
  on events for insert
  to authenticated
  with check (
    promoter_id = auth.uid()
    and exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role in ('promoter', 'admin')
    )
  );

create policy events_update_promoter
  on events for update
  to authenticated
  using (
    promoter_id = auth.uid()
    and exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role in ('promoter', 'admin')
    )
  )
  with check (
    promoter_id = auth.uid()
    and exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role in ('promoter', 'admin')
    )
  );

create policy events_delete_promoter
  on events for delete
  to authenticated
  using (
    promoter_id = auth.uid()
    and exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role in ('promoter', 'admin')
    )
  );

create policy events_delete_admin
  on events for delete
  to authenticated
  using (
    exists (
      select 1 from roles r
      where r.user_id = auth.uid()
        and r.role = 'admin'
    )
  );
