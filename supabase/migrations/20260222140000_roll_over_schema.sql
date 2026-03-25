-- Roll-over: runners can pay to use a longer race split for a shorter distance.
-- Promoter sets whether the event allows roll-over and the distance order (shortest to longest).

-- Events: promoter states if roll-over is allowed
alter table events
  add column if not exists allow_roll_over boolean not null default false;

comment on column events.allow_roll_over is 'If true, runners can add roll-over entries (use a longer race split for a shorter distance).';

-- Distances: order for roll-over (1 = shortest, 2, 3 = longest). Roll-over is only "down" (longer → shorter).
alter table distances
  add column if not exists sort_order smallint null;

comment on column distances.sort_order is 'Order for roll-over: 1 = shortest, 2, 3 = longest. Used only when event.allow_roll_over is true.';

-- Entries: primary (the run they do) vs roll_over (paid split from a longer run)
alter table entries
  add column if not exists entry_type text not null default 'primary' check (entry_type in ('primary', 'roll_over'));

alter table entries
  add column if not exists source_entry_id uuid null references entries(id) on delete set null;

comment on column entries.entry_type is 'primary = runner runs this distance. roll_over = time comes from source_entry split.';
comment on column entries.source_entry_id is 'For roll_over entries: the entry whose run supplies the split time.';

-- Optional: ensure roll_over entries have source_entry_id (application can enforce full rules)
-- alter table entries add constraint entries_roll_over_has_source
--   check (entry_type <> 'roll_over' or source_entry_id is not null);
