-- On user creation, create a membership record. Runs with definer rights so insert succeeds.

create or replace function public.handle_new_user_create_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.memberships (user_id, status, membership_start_at, membership_end_at, renewal_count, updated_at)
  values (
    new.id,
    'active',
    now(),
    now() + interval '1 year',
    0,
    now()
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Trigger on auth.users (Supabase Auth). Requires trigger to exist in auth schema.
drop trigger if exists on_auth_user_created_create_membership on auth.users;
create trigger on_auth_user_created_create_membership
  after insert on auth.users
  for each row
  execute function public.handle_new_user_create_membership();

-- Allow trigger to insert (trigger runs as definer; if RLS still applies, service role may need policy)
drop policy if exists memberships_insert_trigger on memberships;
create policy memberships_insert_trigger on memberships for insert to authenticated
  with check (user_id = auth.uid());

-- Backfill: ensure existing auth users have a membership (run once; idempotent via on conflict)
insert into public.memberships (user_id, status, membership_start_at, membership_end_at, renewal_count, updated_at)
select u.id, 'active', now(), now() + interval '1 year', 0, now()
from auth.users u
where not exists (select 1 from public.memberships m where m.user_id = u.id)
on conflict (user_id) do update set
  membership_start_at = coalesce(memberships.membership_start_at, excluded.membership_start_at),
  membership_end_at = coalesce(memberships.membership_end_at, excluded.membership_end_at),
  updated_at = now();
