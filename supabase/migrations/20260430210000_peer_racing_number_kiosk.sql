-- Canonical public athlete id: profiles.pr_id (Peer Racing ID / lifetime bib #). Used for kiosk search and mirrored to entries.bib for Race Result.
-- Search RPC shape is updated in 20260430220000_search_entries_kiosk_one_row_per_runner.sql.

alter table public.profiles
  add column if not exists pr_id text null;

create unique index if not exists profiles_pr_id_unique
  on public.profiles (pr_id)
  where pr_id is not null and trim(pr_id) <> '';

comment on column public.profiles.pr_id is 'Peer Racing ID / lifetime bib # (e.g. 0001). Forward-facing runner id; entries.bib mirrors per event for RR API.';
