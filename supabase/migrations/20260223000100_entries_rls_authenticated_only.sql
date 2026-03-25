-- No anonymous entries: require authenticated user; user_id must match auth.uid().
-- Remove anon insert and anon select for entries.

drop policy if exists entries_insert_public on entries;
create policy entries_insert_public
  on entries for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from events e
      where e.id = entries.event_id
        and e.status = 'published'
    )
  );

drop policy if exists entries_select_published_event on entries;
-- (anon can no longer select entries; authenticated select via entries_select_own and entries_select_manage)
