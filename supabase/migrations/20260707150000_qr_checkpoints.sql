-- QR trail checkpoints: promoter-placed signs runners scan with their phone camera.
-- Each scan pings Peer Racing (progress tracking) and can play an audio story.

create table if not exists public.qr_checkpoints (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  distance_id uuid not null references public.distances (id) on delete cascade,
  name text not null,
  mile_marker text null,
  sort_order integer not null default 0,
  -- Storage path in the checkpoint-audio bucket; null = no audio story.
  audio_path text null,
  -- Short unguessable slug encoded in the QR URL (peerracing.com/c/<token>).
  token text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists qr_checkpoints_distance_idx on public.qr_checkpoints (distance_id, sort_order);
create index if not exists qr_checkpoints_event_idx on public.qr_checkpoints (event_id);

comment on table public.qr_checkpoints is
  'Promoter-defined QR checkpoint signs along a race course. QR encodes /c/<token>.';

-- One row per (checkpoint, device). Re-scans bump last_scanned_at/scan_count
-- so a runner scanning twice (or a bored kid) never double-counts.
create table if not exists public.checkpoint_scans (
  id uuid primary key default gen_random_uuid(),
  checkpoint_id uuid not null references public.qr_checkpoints (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  distance_id uuid not null references public.distances (id) on delete cascade,
  -- Resolved runner, when we could match a bib or a logged-in account.
  entry_id uuid null references public.entries (id) on delete set null,
  -- Raw bib the scanner typed (kept even if it did not match an entry).
  bib text null,
  -- Random id persisted in the phone's localStorage; scopes dedupe per device.
  device_id text not null,
  first_scanned_at timestamptz not null default now(),
  last_scanned_at timestamptz not null default now(),
  scan_count integer not null default 1,
  constraint checkpoint_scans_device_unique unique (checkpoint_id, device_id)
);

create index if not exists checkpoint_scans_event_idx on public.checkpoint_scans (event_id, first_scanned_at);
create index if not exists checkpoint_scans_entry_idx on public.checkpoint_scans (entry_id);

comment on table public.checkpoint_scans is
  'Runner phone scans of QR checkpoints. Deduped per device; entry_id links to the roster when known.';

-- Promoter toggle: expose the live checkpoint board publicly (family/spectators).
alter table public.events
  add column if not exists checkpoint_scans_public boolean not null default false;

comment on column public.events.checkpoint_scans_public is
  'When true, the live QR checkpoint progress board for this event is publicly viewable.';

-- RLS: all public scan-page traffic goes through the service role server-side.
-- Direct client access is promoter/admin read-only.
alter table public.qr_checkpoints enable row level security;
alter table public.checkpoint_scans enable row level security;

drop policy if exists "qr_checkpoints_promoter_select" on public.qr_checkpoints;
create policy "qr_checkpoints_promoter_select"
  on public.qr_checkpoints for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = qr_checkpoints.event_id and e.promoter_id = auth.uid()
    )
    or exists (
      select 1 from public.roles r
      where r.user_id = auth.uid() and r.role = 'admin'
    )
  );

drop policy if exists "checkpoint_scans_promoter_select" on public.checkpoint_scans;
create policy "checkpoint_scans_promoter_select"
  on public.checkpoint_scans for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = checkpoint_scans.event_id and e.promoter_id = auth.uid()
    )
    or exists (
      select 1 from public.roles r
      where r.user_id = auth.uid() and r.role = 'admin'
    )
  );

-- Audio stories live in a public-read bucket; uploads happen server-side only.
insert into storage.buckets (id, name, public)
values ('checkpoint-audio', 'checkpoint-audio', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "checkpoint_audio_select_public" on storage.objects;
create policy "checkpoint_audio_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'checkpoint-audio');
