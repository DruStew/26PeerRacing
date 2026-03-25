-- Entries insert: allow anon/authenticated insert for published events only.
-- Cutoff is enforced in the API (per-distance or event); RLS no longer requires
-- cutoff_snapshot = e.pr_cutoff (event pr_cutoff is nullable and we use per-distance cutoffs).
-- Use "to anon, authenticated" so unauthenticated form submissions (anon key) are allowed.

drop policy if exists entries_insert_public on entries;

create policy entries_insert_public
  on entries for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and e.status = 'published'
    )
  );

-- Let anon read entries for published events (needed for insert().select() and any confirmation read).
drop policy if exists entries_select_published_event on entries;
create policy entries_select_published_event
  on entries for select
  to anon
  using (
    exists (
      select 1 from events e
      where e.id = entries.event_id
        and e.status = 'published'
    )
  );
