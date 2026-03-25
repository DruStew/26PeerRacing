-- Remove start_time; use gun_time only for race start/gun time.
alter table distances drop column if exists start_time;
