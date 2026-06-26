-- Undo kiosk check-in via RPC (same pattern as kiosk_confirm_entry_check_in).
create or replace function public.kiosk_revert_entry_check_in(p_event_id uuid, p_entry_id uuid)
returns setof public.entries
language sql
security definer
set search_path = public
as $$
  update public.entries
  set kiosk_checked_in_at = null
  where id = p_entry_id and event_id = p_event_id
  returning *;
$$;

comment on function public.kiosk_revert_entry_check_in(uuid, uuid) is
  'Kiosk volunteer undo check-in: clears entries.kiosk_checked_in_at. Called with service_role.';

revoke all on function public.kiosk_revert_entry_check_in(uuid, uuid) from public;
grant execute on function public.kiosk_revert_entry_check_in(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
