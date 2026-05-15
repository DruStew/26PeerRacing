-- Producer payout calculator settings (variable fees, splits, divisions, schedule bracket).
create table if not exists public.event_payout_settings (
  event_id uuid primary key references public.events (id) on delete cascade,
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

comment on table public.event_payout_settings is 'Peer Racing producer payout model inputs; schedule weights live in app code (Payout Schedule).';
comment on column public.event_payout_settings.elite_division_carve_cents is 'Taken from contestant pool and stacked on elite division before even split of remainder.';
comment on column public.event_payout_settings.places_to_pay is 'How many finishing positions to pay per division (1–12); fixed schedule weights renormalized across these holes.';

create index if not exists event_payout_settings_updated_at_idx on public.event_payout_settings (updated_at desc);

alter table public.event_payout_settings enable row level security;

drop policy if exists event_payout_settings_select_manage on public.event_payout_settings;
create policy event_payout_settings_select_manage
  on public.event_payout_settings for select
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_payout_settings.event_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );

drop policy if exists event_payout_settings_insert_manage on public.event_payout_settings;
create policy event_payout_settings_insert_manage
  on public.event_payout_settings for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.events e
      where e.id = event_payout_settings.event_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );

drop policy if exists event_payout_settings_update_manage on public.event_payout_settings;
create policy event_payout_settings_update_manage
  on public.event_payout_settings for update
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_payout_settings.event_id
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
      from public.events e
      where e.id = event_payout_settings.event_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );

drop policy if exists event_payout_settings_delete_manage on public.event_payout_settings;
create policy event_payout_settings_delete_manage
  on public.event_payout_settings for delete
  to authenticated
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_payout_settings.event_id
        and (
          e.promoter_id = auth.uid()
          or exists (
            select 1 from public.roles r
            where r.user_id = auth.uid() and r.role = 'admin'
          )
        )
    )
  );
