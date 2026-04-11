-- Allow runners to DELETE their own entries while registration is still open.
-- Same as migration 20260402120000_entries_delete_own_when_open.sql

drop policy if exists entries_delete_own_open on public.entries;

create policy entries_delete_own_open
  on public.entries for delete
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.events e
      inner join public.distances d on d.event_id = e.id and d.id = entries.distance_id
      where e.id = entries.event_id
        and (
          coalesce(d.pr_cutoff, e.pr_cutoff) is null
          or now() < coalesce(d.pr_cutoff, e.pr_cutoff)
        )
    )
  );
