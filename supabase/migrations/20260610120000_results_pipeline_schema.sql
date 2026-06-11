-- Results pipeline, step 1: upgrade results / badges / results_raw for the
-- producer results console -> publish -> racer trophy case flow.
--
-- Money fields are snapshots of what the payout calculator (lib/payout) produced
-- at publish time; the algorithm only places runners into divisions.

-- ---------------------------------------------------------------------------
-- results: one row per finisher per distance
-- ---------------------------------------------------------------------------

alter table public.results
  add column if not exists user_id uuid null references auth.users (id) on delete set null,
  add column if not exists distance_id uuid null references public.distances (id) on delete cascade,
  add column if not exists division text null,
  add column if not exists division_place integer null,
  add column if not exists payout_cents integer not null default 0,
  add column if not exists female_incentive_division text null,
  add column if not exists female_incentive_place integer null,
  add column if not exists female_incentive_payout_cents integer not null default 0,
  add column if not exists military_incentive_division text null,
  add column if not exists military_incentive_place integer null,
  add column if not exists military_incentive_payout_cents integer not null default 0,
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz null,
  add column if not exists created_at timestamptz not null default now();

-- Superseded by the explicit incentive columns above (tables are empty pre-launch).
alter table public.results
  drop column if exists incentive_1,
  drop column if exists incentive_2,
  drop column if exists incentive_3;

comment on column public.results.division is 'Peer Racing division label (Alpha..Echo) assigned by the algorithm.';
comment on column public.results.payout_cents is 'Main division payout snapshot from saved payout settings at publish.';
comment on column public.results.published is 'Row visible to the public/racer once the producer publishes this distance.';

create index if not exists results_event_distance_rank_idx
  on public.results (event_id, distance_id, overall_rank);

create index if not exists results_user_published_idx
  on public.results (user_id, published);

-- One result per entry per distance (entry already scoped to event+distance).
create unique index if not exists results_entry_unique
  on public.results (entry_id)
  where entry_id is not null;

-- ---------------------------------------------------------------------------
-- distances: per-distance publish marker (5K can publish before the half)
-- ---------------------------------------------------------------------------

alter table public.distances
  add column if not exists results_published_at timestamptz null;

comment on column public.distances.results_published_at is 'Set when the producer publishes results for this distance.';

-- ---------------------------------------------------------------------------
-- badges: awarded at publish, shown in racer trophy case
-- ---------------------------------------------------------------------------

alter table public.badges
  add column if not exists distance_id uuid null references public.distances (id) on delete cascade,
  add column if not exists result_id uuid null references public.results (id) on delete cascade,
  add column if not exists division text null,
  add column if not exists division_place integer null,
  add column if not exists payout_cents integer not null default 0;

comment on column public.badges.badge_key is 'Stable key, e.g. division_alpha, female_incentive, military_incentive.';

-- No duplicate badge of the same kind for the same runner on the same distance.
create unique index if not exists badges_user_distance_key_unique
  on public.badges (user_id, distance_id, badge_key)
  where user_id is not null and distance_id is not null;

-- ---------------------------------------------------------------------------
-- results_raw: imported timing rows awaiting match review (pipeline step 2)
-- ---------------------------------------------------------------------------

alter table public.results_raw
  add column if not exists distance_id uuid null references public.distances (id) on delete cascade,
  add column if not exists import_batch uuid null,
  add column if not exists source_filename text null,
  add column if not exists matched_entry_id uuid null references public.entries (id) on delete set null,
  add column if not exists match_status text not null default 'unmatched'
    check (match_status in ('matched', 'unmatched', 'ignored'));

create index if not exists results_raw_event_distance_status_idx
  on public.results_raw (event_id, distance_id, match_status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- results: public sees published rows only (row-level, replaces event-wide flag check)
drop policy if exists results_select_public on public.results;
create policy results_select_public
  on public.results for select
  to public
  using (published = true);

-- results: racers always see their own rows (published or not stays producer-side
-- until publish, so restrict to published for racers too -- they should not see
-- provisional divisions while the producer is still tweaking the ends)
drop policy if exists results_select_own on public.results;
create policy results_select_own
  on public.results for select
  to authenticated
  using (user_id = auth.uid() and published = true);

-- results: promoter/admin delete (re-import / recompute wipes provisional rows)
drop policy if exists results_delete_manage on public.results;
create policy results_delete_manage
  on public.results for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          ))
    )
  );

-- badges: promoter of the event (not just admin) awards at publish
drop policy if exists badges_insert_manage on public.badges;
create policy badges_insert_manage
  on public.badges for insert
  to authenticated
  with check (
    exists (
      select 1 from public.events e
      where e.id = badges.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          ))
    )
  );

drop policy if exists badges_delete_manage on public.badges;
create policy badges_delete_manage
  on public.badges for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = badges.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          ))
    )
  );

-- results_raw: producers could only insert before; they need to read, fix matches,
-- and clear bad imports too
drop policy if exists results_raw_select_manage on public.results_raw;
create policy results_raw_select_manage
  on public.results_raw for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          ))
    )
  );

drop policy if exists results_raw_update_manage on public.results_raw;
create policy results_raw_update_manage
  on public.results_raw for update
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          ))
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          ))
    )
  );

drop policy if exists results_raw_delete_manage on public.results_raw;
create policy results_raw_delete_manage
  on public.results_raw for delete
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = results_raw.event_id
        and (e.promoter_id = auth.uid() or
          exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          ))
    )
  );

notify pgrst, 'reload schema';
