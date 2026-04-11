-- Run in Supabase SQL Editor if you see: "Could not find the function public.entry_counts_for_events"
-- (Same as migration 20260330000000_entry_counts_for_events_rpc.sql)

create or replace function public.entry_counts_for_events(p_event_ids uuid[])
returns table (event_id uuid, distance_id uuid, entry_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.event_id, e.distance_id, count(*)::bigint
  from public.entries e
  inner join public.events ev on ev.id = e.event_id and ev.status = 'published'
  where e.distance_id is not null
    and e.event_id = any(p_event_ids)
  group by e.event_id, e.distance_id;
$$;

grant execute on function public.entry_counts_for_events(uuid[]) to anon, authenticated;
