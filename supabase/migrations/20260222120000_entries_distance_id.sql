-- Add distance_id to entries so participants can choose which race (5K, 10K, etc.)
alter table entries
  add column if not exists distance_id uuid null references distances(id);

comment on column entries.distance_id is 'Which distance/race within the event (e.g. 5K, 10K). Null = event-level only.';
