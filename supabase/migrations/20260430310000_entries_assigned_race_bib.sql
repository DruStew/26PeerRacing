-- Host / timing bib assigned at event check-in (per entry = per distance within the event).
-- Distinct from profiles.pr_id and entries.bib (Race Result / PR lifetime). Searchable in kiosk lookup.
alter table public.entries
  add column if not exists assigned_bib text null;

comment on column public.entries.assigned_bib is
  'Race-day bib from host timing (sidepot, chip-timed, etc.). Scoped to this entry (event + distance). Kiosk search matches this value for this event.';

drop function if exists public.search_entries_for_kiosk(uuid, text);

create or replace function public.search_entries_for_kiosk(p_event_id uuid, p_q text)
returns table (
  id uuid,
  user_id uuid,
  pr_id text,
  first_name text,
  last_name text,
  bib text,
  phone text,
  email text,
  entry_count bigint,
  distance_summary text
)
language sql
security definer
set search_path = public
stable
as $$
  with q as (
    select trim(coalesce(p_q, '')) as t
  ),
  words as (
    select
      nullif(trim(t), '') as t,
      cardinality(string_to_array(nullif(trim(t), ''), ' ')) as n,
      (string_to_array(nullif(trim(t), ''), ' '))[1] as w1,
      (string_to_array(nullif(trim(t), ''), ' '))[cardinality(string_to_array(nullif(trim(t), ''), ' '))] as wlast
    from q
  ),
  matched as (
    select
      e.id,
      e.user_id,
      e.first_name as en_first,
      e.last_name as en_last,
      e.bib as en_bib,
      e.assigned_bib as en_assigned_bib,
      e.phone as en_phone,
      e.email as en_email,
      p.pr_id as pr_profile_id,
      p.first_name as pf_first,
      p.last_name as pf_last,
      p.phone as pf_phone,
      p.email as pf_email,
      d.label as distance_label,
      coalesce(
        e.user_id::text,
        (
          select e2.user_id::text
          from public.entries e2
          where e2.event_id = e.event_id
            and lower(trim(e2.email)) = lower(trim(e.email))
            and e2.user_id is not null
          limit 1
        ),
        'em:' || lower(trim(e.email))
      ) as runner_key_text
    from public.entries e
    inner join public.distances d on d.id = e.distance_id
    left join public.profiles p on p.id = e.user_id
    cross join words
    where e.event_id = p_event_id
      and length(words.t) >= 2
      and (
        (e.bib is not null and e.bib = words.t)
        or (e.assigned_bib is not null and trim(e.assigned_bib) <> '' and e.assigned_bib = words.t)
        or (p.pr_id is not null and p.pr_id = words.t)
        or e.email ilike '%' || words.t || '%'
        or regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') like '%' || regexp_replace(words.t, '\D', '', 'g') || '%'
        or e.first_name ilike '%' || words.t || '%'
        or e.last_name ilike '%' || words.t || '%'
        or (
          coalesce(words.n, 0) >= 2
          and e.first_name ilike '%' || words.w1 || '%'
          and e.last_name ilike '%' || words.wlast || '%'
        )
      )
  ),
  grouped as (
    select
      (array_agg(m.id order by m.id))[1] as id,
      (array_agg(m.user_id order by m.id) filter (where m.user_id is not null))[1] as user_id,
      max(m.pr_profile_id) as pr_id,
      max(coalesce(m.pf_first, m.en_first)) as first_name,
      max(coalesce(m.pf_last, m.en_last)) as last_name,
      max(coalesce(nullif(trim(m.en_assigned_bib), ''), m.pr_profile_id, m.en_bib)) as bib,
      max(coalesce(m.pf_phone, m.en_phone)) as phone,
      max(coalesce(m.pf_email, m.en_email)) as email,
      count(*)::bigint as entry_count,
      string_agg(distinct nullif(trim(m.distance_label), ''), ' · ') as distance_summary
    from matched m
    group by m.runner_key_text
  )
  select
    g.id,
    g.user_id,
    g.pr_id,
    g.first_name,
    g.last_name,
    g.bib,
    g.phone,
    g.email,
    g.entry_count,
    g.distance_summary
  from grouped g
  order by g.last_name, g.first_name
  limit 40;
$$;

revoke all on function public.search_entries_for_kiosk(uuid, text) from public;
grant execute on function public.search_entries_for_kiosk(uuid, text) to service_role;

notify pgrst, 'reload schema';
