-- Lifetime PR IDs (profiles.pr_id):
--  * Numbers 1-5000 are reserved for special members, assigned by hand.
--  * Regular members draw from a sequence starting at 5001.
--  * A trigger assigns the next number the moment a membership becomes active,
--    so every paid member automatically gets their lifetime number.
--  * Backfills any current active members who are missing one.

create sequence if not exists public.pr_id_seq start 5001 minvalue 5001;

-- Bump the sequence past any numeric pr_ids that already exist (e.g. seeded test runners).
select setval(
  'public.pr_id_seq',
  greatest(
    5000,
    coalesce((select max(pr_id::bigint) from public.profiles where pr_id ~ '^\d+$'), 5000)
  )
);

create or replace function public.assign_pr_id_on_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    update public.profiles
      set pr_id = nextval('public.pr_id_seq')::text
      where id = new.user_id
        and (pr_id is null or trim(pr_id) = '');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_pr_id_on_membership on public.memberships;
create trigger trg_assign_pr_id_on_membership
  after insert or update of status on public.memberships
  for each row
  execute function public.assign_pr_id_on_membership();

-- Backfill: every current active member without a PR ID gets the next number,
-- in membership-start order.
do $$
declare
  r record;
begin
  for r in
    select p.id
    from public.profiles p
    join public.memberships m on m.user_id = p.id and m.status = 'active'
    where p.pr_id is null or trim(p.pr_id) = ''
    order by m.membership_start_at nulls last, p.created_at
  loop
    update public.profiles set pr_id = nextval('public.pr_id_seq')::text where id = r.id;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
