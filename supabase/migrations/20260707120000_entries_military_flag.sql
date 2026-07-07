-- Military flag on the entry itself so entry-only runners (demo imports) can
-- receive military incentives. Null = unknown; results/payout fall back to the
-- runner's profile flag for account-backed entries.

alter table public.entries
  add column if not exists active_or_retired_military boolean;

comment on column public.entries.active_or_retired_military is
  'Per-entry military flag for entry-only runners (e.g. demo imports); null falls back to profiles.active_or_retired_military.';
