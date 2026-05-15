-- Race Result alignment: participant Transponder1 / Transponder2 (per entry, per event).
alter table public.entries
  add column if not exists transponder_1 text null,
  add column if not exists transponder_2 text null;

comment on column public.entries.transponder_1 is 'RFID / chip code (Race Result Transponder1); optional; set at check-in or bulk import from RR.';
comment on column public.entries.transponder_2 is 'Second chip / backup (Race Result Transponder2); optional.';

-- Kiosk search: event-scoped, service-role only in practice (RPC grants controlled access).
create or replace function public.search_entries_for_kiosk(p_event_id uuid, p_q text)
returns table (
  id uuid,
  first_name text,
  last_name text,
  bib text,
  phone text,
  email text,
  transponder_1 text,
  transponder_2 text,
  distance_id uuid,
  distance_label text
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
  )
  select
    e.id,
    e.first_name,
    e.last_name,
    e.bib,
    e.phone,
    e.email,
    e.transponder_1,
    e.transponder_2,
    e.distance_id,
    d.label as distance_label
  from public.entries e
  inner join public.distances d on d.id = e.distance_id
  cross join words
  where e.event_id = p_event_id
    and length(words.t) >= 2
    and (
      (e.bib is not null and e.bib = words.t)
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
  order by e.last_name, e.first_name
  limit 40;
$$;

revoke all on function public.search_entries_for_kiosk(uuid, text) from public;
grant execute on function public.search_entries_for_kiosk(uuid, text) to service_role;
