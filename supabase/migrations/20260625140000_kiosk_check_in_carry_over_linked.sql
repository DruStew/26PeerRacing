-- Carry-Over linked check-in: confirming or undoing one entry in a primary + roll_over group
-- applies to the whole group (one physical race). Independent entries stay single-row.

create or replace function public.kiosk_carry_over_primary_id(p_event_id uuid, p_entry_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.entry_type = 'roll_over' and e.source_entry_id is not null then e.source_entry_id
    else e.id
  end
  from public.entries e
  where e.id = p_entry_id and e.event_id = p_event_id;
$$;

comment on function public.kiosk_carry_over_primary_id(uuid, uuid) is
  'Resolves the primary entry id for a Carry-Over linked kiosk check-in group.';

create or replace function public.kiosk_confirm_entry_check_in(p_event_id uuid, p_entry_id uuid)
returns setof public.entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_id uuid;
begin
  v_primary_id := public.kiosk_carry_over_primary_id(p_event_id, p_entry_id);

  if v_primary_id is null then
    return;
  end if;

  return query
  update public.entries
  set kiosk_checked_in_at = now()
  where event_id = p_event_id
    and (
      id = v_primary_id
      or (entry_type = 'roll_over' and source_entry_id = v_primary_id)
    )
  returning *;
end;
$$;

comment on function public.kiosk_confirm_entry_check_in(uuid, uuid) is
  'Kiosk check-in: sets kiosk_checked_in_at on the entry and any linked Carry-Over splits.';

create or replace function public.kiosk_revert_entry_check_in(p_event_id uuid, p_entry_id uuid)
returns setof public.entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_primary_id uuid;
begin
  v_primary_id := public.kiosk_carry_over_primary_id(p_event_id, p_entry_id);

  if v_primary_id is null then
    return;
  end if;

  return query
  update public.entries
  set kiosk_checked_in_at = null
  where event_id = p_event_id
    and (
      id = v_primary_id
      or (entry_type = 'roll_over' and source_entry_id = v_primary_id)
    )
  returning *;
end;
$$;

comment on function public.kiosk_revert_entry_check_in(uuid, uuid) is
  'Kiosk undo check-in: clears kiosk_checked_in_at on the entry and any linked Carry-Over splits.';

revoke all on function public.kiosk_carry_over_primary_id(uuid, uuid) from public;
grant execute on function public.kiosk_carry_over_primary_id(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
