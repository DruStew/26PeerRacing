-- =============================================================================
-- Event artwork (optional poster / banner) — full setup
-- =============================================================================
-- Same as supabase/migrations/20260331120000_event_artwork_storage.sql
-- =============================================================================

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

alter table public.events
  add column if not exists artwork_url text null;

comment on column public.events.artwork_url is
  'Optional. Public URL for race poster/banner (Supabase Storage). Null = no artwork.';

insert into storage.buckets (id, name, public)
values ('event-artwork', 'event-artwork', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "event_artwork_select_public" on storage.objects;
create policy "event_artwork_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'event-artwork');

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
