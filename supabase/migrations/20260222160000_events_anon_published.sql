-- Ensure unauthenticated (anon) users can see published events on the public /events page.
drop policy if exists events_select_published_anon on events;
create policy events_select_published_anon
  on events for select
  to anon
  using (status = 'published');
