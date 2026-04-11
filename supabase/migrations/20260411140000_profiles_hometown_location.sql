-- Optional home location for marketing (local races). Not required for profile completion.
alter table public.profiles
  add column if not exists hometown text null,
  add column if not exists home_state text null,
  add column if not exists zip text null;

comment on column public.profiles.hometown is 'Runner hometown (city or area); optional; for local race marketing.';
comment on column public.profiles.home_state is 'US state or region; optional.';
comment on column public.profiles.zip is 'Postal/ZIP code; optional.';
