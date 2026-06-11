-- Kiosk search overhaul:
--  * Match against profile fields (name/email/phone), not just the entries row —
--    web-flow entries keep runner info on the profile.
--  * Rank results by relevance: exact bib/PR ID/email/full name first, prefix
--    matches next, loose substring matches last.
--  * Phone digits only match on runs of 7+ digits, so the "02" inside an email
--    address no longer phone-matches half the field.

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
  with words as (
    select
      lower(trim(coalesce(p_q, ''))) as t,
      regexp_replace(coalesce(p_q, ''), '\D', '', 'g') as qdigits,
      cardinality(string_to_array(lower(trim(coalesce(p_q, ''))), ' ')) as n,
      (string_to_array(lower(trim(coalesce(p_q, ''))), ' '))[1] as w1,
      (string_to_array(lower(trim(coalesce(p_q, ''))), ' '))[
        cardinality(string_to_array(lower(trim(coalesce(p_q, ''))), ' '))
      ] as wlast
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
        'em:' || lower(trim(coalesce(e.email, '')))
      ) as runner_key_text,
      least(
        -- Exact identifiers: bib, race-day bib, PR ID
        case
          when lower(coalesce(e.bib, '')) = w.t
            or lower(coalesce(trim(e.assigned_bib), '')) = w.t
            or lower(coalesce(p.pr_id, '')) = w.t
          then 0
          else 99
        end,
        -- Email: exact > prefix > substring (entry or profile)
        case
          when lower(coalesce(e.email, '')) = w.t or lower(coalesce(p.email, '')) = w.t then 0
          when length(w.t) >= 3 and (
            coalesce(e.email, '') ilike w.t || '%' or coalesce(p.email, '') ilike w.t || '%'
          ) then 1
          when length(w.t) >= 3 and (
            coalesce(e.email, '') ilike '%' || w.t || '%' or coalesce(p.email, '') ilike '%' || w.t || '%'
          ) then 4
          else 99
        end,
        -- Full name: exact > "first last" prefix pair > single-word prefix > substring
        case
          when lower(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))) = w.t
            or lower(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))) = w.t
          then 0
          when w.n >= 2 and (
            (coalesce(e.first_name, '') ilike w.w1 || '%' and coalesce(e.last_name, '') ilike w.wlast || '%')
            or (coalesce(p.first_name, '') ilike w.w1 || '%' and coalesce(p.last_name, '') ilike w.wlast || '%')
          ) then 1
          when coalesce(e.first_name, '') ilike w.t || '%'
            or coalesce(e.last_name, '') ilike w.t || '%'
            or coalesce(p.first_name, '') ilike w.t || '%'
            or coalesce(p.last_name, '') ilike w.t || '%'
          then 2
          when coalesce(e.first_name, '') ilike '%' || w.t || '%'
            or coalesce(e.last_name, '') ilike '%' || w.t || '%'
            or coalesce(p.first_name, '') ilike '%' || w.t || '%'
            or coalesce(p.last_name, '') ilike '%' || w.t || '%'
          then 4
          else 99
        end,
        -- Phone: require a meaningful digit run so emails/names never digit-match
        case
          when length(w.qdigits) >= 7 and (
            regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') like '%' || w.qdigits || '%'
            or regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') like '%' || w.qdigits || '%'
          ) then 1
          else 99
        end
      ) as rank
    from public.entries e
    inner join public.distances d on d.id = e.distance_id
    left join public.profiles p on p.id = e.user_id
    cross join words w
    where e.event_id = p_event_id
      and length(w.t) >= 2
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
      string_agg(distinct nullif(trim(m.distance_label), ''), ' · ') as distance_summary,
      min(m.rank) as rank
    from matched m
    where m.rank < 99
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
  order by g.rank, g.last_name, g.first_name
  limit 40;
$$;

revoke all on function public.search_entries_for_kiosk(uuid, text) from public;
grant execute on function public.search_entries_for_kiosk(uuid, text) to service_role;

notify pgrst, 'reload schema';
