-- Allow public (anon) to see roll-over options on the enter form for published events.
drop policy if exists distance_roll_over_sources_select_public on distance_roll_over_sources;
create policy distance_roll_over_sources_select_public
  on distance_roll_over_sources for select
  to anon
  using (
    exists (
      select 1 from distances d
      join events e on e.id = d.event_id
      where d.id = distance_roll_over_sources.distance_id
        and e.status = 'published'
    )
  );
