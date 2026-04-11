-- Fix: storage INSERT failed with "new row violates row-level security policy"
-- when policies inlined EXISTS (SELECT ... FROM events) — nested SELECT was blocked by RLS.
-- Safe to run if you already applied the previous artwork migration without this function.

create or replace function public.is_event_artwork_upload_allowed(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    where e.id::text = split_part(trim(both '/' from coalesce(p_object_name, '')), '/', 1)
      and e.promoter_id = auth.uid()
  )
  or exists (
    select 1
    from public.roles r
    where r.user_id = auth.uid()
      and r.role = 'admin'
  );
$$;

grant execute on function public.is_event_artwork_upload_allowed(text) to authenticated;

drop policy if exists "event_artwork_insert_promoter" on storage.objects;
create policy "event_artwork_insert_promoter"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-artwork'
    and public.is_event_artwork_upload_allowed(name)
  );

drop policy if exists "event_artwork_update_promoter" on storage.objects;
create policy "event_artwork_update_promoter"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-artwork'
    and public.is_event_artwork_upload_allowed(name)
  )
  with check (
    bucket_id = 'event-artwork'
    and public.is_event_artwork_upload_allowed(name)
  );

drop policy if exists "event_artwork_delete_promoter" on storage.objects;
create policy "event_artwork_delete_promoter"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-artwork'
    and public.is_event_artwork_upload_allowed(name)
  );
