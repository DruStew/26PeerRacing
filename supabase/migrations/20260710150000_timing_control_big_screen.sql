-- Race Control + big-screen live results + finisher clips.
--
-- big_screen_public: promoter toggle making /events/[id]/big-screen viewable
-- by anyone (venue TVs, folks at home). Independent of results publishing.
--
-- finish-clips bucket: short crossing clips extracted from the Finish Cam
-- rolling buffer (~12s each). Public read like other event media; writes go
-- through service-role APIs only. Clip paths live in
-- timing_finish_events.detail->>'clip_path' (no schema change needed).

alter table public.events
  add column if not exists big_screen_public boolean not null default false;

comment on column public.events.big_screen_public is
  'When true, the big-screen live results page for this event is publicly viewable.';

insert into storage.buckets (id, name, public)
values ('finish-clips', 'finish-clips', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "finish_clips_select_public" on storage.objects;
create policy "finish_clips_select_public"
  on storage.objects for select to public
  using (bucket_id = 'finish-clips');

-- No insert/update/delete policies: uploads happen server-side (service role).

notify pgrst, 'reload schema';
