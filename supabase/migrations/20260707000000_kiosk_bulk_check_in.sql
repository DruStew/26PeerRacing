-- Bulk kiosk check-in: confirm many entries in one statement (roster "check all").
-- Mirrors kiosk_confirm_entry_check_in semantics: confirming any entry in a
-- primary + Carry-Over group checks in the whole group.

create or replace function public.kiosk_bulk_confirm_check_in(p_event_id uuid, p_entry_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with primaries as (
    select distinct public.kiosk_carry_over_primary_id(p_event_id, e.id) as pid
    from public.entries e
    where e.event_id = p_event_id
      and e.id = any(p_entry_ids)
  )
  update public.entries e
  set kiosk_checked_in_at = now()
  where e.event_id = p_event_id
    and e.kiosk_checked_in_at is null
    and (
      e.id in (select pid from primaries where pid is not null)
      or (
        e.entry_type = 'roll_over'
        and e.source_entry_id in (select pid from primaries where pid is not null)
      )
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.kiosk_bulk_confirm_check_in(uuid, uuid[]) is
  'Bulk kiosk check-in for the promoter roster: sets kiosk_checked_in_at on the given entries and linked Carry-Over splits. Called with service_role.';

revoke all on function public.kiosk_bulk_confirm_check_in(uuid, uuid[]) from public;
grant execute on function public.kiosk_bulk_confirm_check_in(uuid, uuid[]) to service_role;

notify pgrst, 'reload schema';
