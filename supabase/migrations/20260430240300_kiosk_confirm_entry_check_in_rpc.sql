-- Check-in confirm via RPC so PostgREST does not reject kiosk_checked_in_at when its *table* schema cache lags
-- (column exists in Postgres; NOTIFY may not have run yet for REST PATCH).
alter table public.entries
  add column if not exists kiosk_checked_in_at timestamptz null;

create or replace function public.kiosk_confirm_entry_check_in(p_event_id uuid, p_entry_id uuid)
returns setof public.entries
language sql
security definer
set search_path = public
as $$
  update public.entries
  set kiosk_checked_in_at = now()
  where id = p_entry_id and event_id = p_event_id
  returning *;
$$;

comment on function public.kiosk_confirm_entry_check_in(uuid, uuid) is
  'Kiosk volunteer check-in: sets entries.kiosk_checked_in_at. Called with service_role; avoids REST PATCH schema-cache issues.';

revoke all on function public.kiosk_confirm_entry_check_in(uuid, uuid) from public;
grant execute on function public.kiosk_confirm_entry_check_in(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
