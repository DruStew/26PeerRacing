-- Peer Racing Qualifier: one per event. Only this race can supply roll-over splits.
-- Other distances opt in with "allow Qualifier split to roll over to this race".

alter table distances
  add column if not exists is_peer_racing_qualifier boolean not null default false,
  add column if not exists allow_roll_over_from_qualifier boolean not null default false,
  add column if not exists allow_qualifier_split_to_roll_over_here boolean not null default false;

comment on column distances.is_peer_racing_qualifier is 'This distance is the Peer Racing Qualifier for the event (max one per event). Only the Qualifier can supply roll-over splits.';
comment on column distances.allow_roll_over_from_qualifier is 'When this distance is the Qualifier: allow its splits to roll over to other races that opt in.';
comment on column distances.allow_qualifier_split_to_roll_over_here is 'When this distance is not the Qualifier: allow the event Qualifier split to roll over to this race.';

-- At most one Qualifier per event
create unique index if not exists distances_one_qualifier_per_event
  on distances (event_id) where (is_peer_racing_qualifier = true);
