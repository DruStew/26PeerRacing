-- Events can span multiple days; gun time and PR cutoff move to distances (per-race).
-- Roll-over is per-distance: which longer races can roll over into this one.

-- Event: optional end date for multi-day; gun_time and pr_cutoff nullable (use distance-level when set)
alter table events
  add column if not exists end_date date null;

comment on column events.end_date is 'Last day of event (multi-day). Null = single day.';

alter table events
  alter column gun_time drop not null,
  alter column pr_cutoff drop not null;

-- Distances: own gun time and PR cutoff (required for entry logic when event has no single time)
alter table distances
  add column if not exists gun_time timestamptz null,
  add column if not exists pr_cutoff timestamptz null;

comment on column distances.gun_time is 'Gun time for this race. Overrides event gun_time when set.';
comment on column distances.pr_cutoff is 'PR/entry cutoff for this race. Overrides event pr_cutoff when set.';

-- Roll-over is per-distance: "this distance can be rolled over from [longer distances]"
create table if not exists distance_roll_over_sources (
  distance_id uuid not null references distances(id) on delete cascade,
  source_distance_id uuid not null references distances(id) on delete cascade,
  primary key (distance_id, source_distance_id),
  check (distance_id <> source_distance_id)
);

comment on table distance_roll_over_sources is 'Runners can roll over from source_distance (longer) into distance (shorter). Roll-over is only down.';

-- RLS for distance_roll_over_sources (same as distances: promoter or admin)
alter table distance_roll_over_sources enable row level security;

drop policy if exists distance_roll_over_sources_select_manage on distance_roll_over_sources;
create policy distance_roll_over_sources_select_manage
  on distance_roll_over_sources for select to authenticated
  using (
    exists (
      select 1 from distances d
      join events e on e.id = d.event_id
      where d.id = distance_roll_over_sources.distance_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists distance_roll_over_sources_insert_manage on distance_roll_over_sources;
create policy distance_roll_over_sources_insert_manage
  on distance_roll_over_sources for insert to authenticated
  with check (
    exists (
      select 1 from distances d
      join events e on e.id = d.event_id
      where d.id = distance_roll_over_sources.distance_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

drop policy if exists distance_roll_over_sources_delete_manage on distance_roll_over_sources;
create policy distance_roll_over_sources_delete_manage
  on distance_roll_over_sources for delete to authenticated
  using (
    exists (
      select 1 from distances d
      join events e on e.id = d.event_id
      where d.id = distance_roll_over_sources.distance_id
        and (e.promoter_id = auth.uid() or is_admin())
    )
  );

-- Remove event-level roll-over; use distance_roll_over_sources only
alter table events
  drop column if exists allow_roll_over;
