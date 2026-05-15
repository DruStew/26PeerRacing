-- Per-distance payout settings (each race/distance has its own pot and saved calculator inputs).
create table if not exists public.distance_payout_settings (
  distance_id uuid primary key references public.distances (id) on delete cascade,
  processing_fee_fraction numeric(12, 10) not null default 0.04,
  pr_holding_fraction numeric(12, 10) not null default 0.5,
  producer_fraction_of_pr_holding numeric(12, 10) not null default 0.5,
  true_added_money_cents integer not null default 0,
  elite_division_carve_cents integer not null default 0,
  division_count integer not null default 1 check (division_count >= 1),
  elite_division_index integer not null default 0 check (elite_division_index >= 0),
  schedule_mode text not null default 'auto' check (schedule_mode in ('auto', 'manual')),
  manual_bracket text null,
  places_to_pay integer not null default 12 check (places_to_pay >= 1 and places_to_pay <= 12),
  division_labels jsonb null,
  entry_count_override integer null,
  entry_fee_cents_override integer null,
  updated_at timestamptz not null default now()
);

comment on table public.distance_payout_settings is 'Producer payout calculator inputs per distance; schedule weights live in app code.';
comment on column public.distance_payout_settings.elite_division_carve_cents is 'Taken from contestant pool and stacked on elite division before even split of remainder.';

create index if not exists distance_payout_settings_updated_at_idx on public.distance_payout_settings (updated_at desc);

alter table public.distance_payout_settings enable row level security;

drop policy if exists distance_payout_settings_select_manage on public.distance_payout_settings;
create policy distance_payout_settings_select_manage
  on public.distance_payout_settings for select
  to authenticated
  using (
    exists (
      select 1
      from public.distances d
      inner join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );

drop policy if exists distance_payout_settings_insert_manage on public.distance_payout_settings;
create policy distance_payout_settings_insert_manage
  on public.distance_payout_settings for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.distances d
      inner join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );

drop policy if exists distance_payout_settings_update_manage on public.distance_payout_settings;
create policy distance_payout_settings_update_manage
  on public.distance_payout_settings for update
  to authenticated
  using (
    exists (
      select 1
      from public.distances d
      inner join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.distances d
      inner join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );

drop policy if exists distance_payout_settings_delete_manage on public.distance_payout_settings;
create policy distance_payout_settings_delete_manage
  on public.distance_payout_settings for delete
  to authenticated
  using (
    exists (
      select 1
      from public.distances d
      inner join public.events e on e.id = d.event_id
      where d.id = distance_payout_settings.distance_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );
