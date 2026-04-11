-- Idempotent membership fulfillment: same Checkout Session must not extend twice.
alter table public.memberships
  add column if not exists stripe_last_checkout_session_id text null;

create unique index if not exists memberships_stripe_checkout_session_uidx
  on public.memberships (stripe_last_checkout_session_id)
  where stripe_last_checkout_session_id is not null;
