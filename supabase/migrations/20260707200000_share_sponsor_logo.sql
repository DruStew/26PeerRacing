-- Per-distance "PR Results powered by" sponsor logo for racer share graphics.
-- Files live in the existing public event-artwork bucket (promoter-writable
-- via the event-id path prefix policy). When a distance has no logo of its
-- own, the app inherits the first logo found on the event's other distances,
-- so a single upload covers every distance unless the promoter overrides it.

alter table public.distances
  add column if not exists share_sponsor_logo_url text null;

comment on column public.distances.share_sponsor_logo_url is
  'Optional sponsor logo (public URL) shown on racer share graphics. Null = inherit from another distance in the event.';
