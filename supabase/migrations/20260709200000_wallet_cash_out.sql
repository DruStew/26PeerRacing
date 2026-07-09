-- Wallet cash-out: Stripe Connect Express payouts + manual (admin-recorded) exceptions.
--
-- Money model (one pool): all entry money sits in the Peer Racing Stripe/bank
-- account; wallet balances are liabilities against it. A cash-out debits the
-- wallet ledger (category bank_withdrawal) the moment it is requested — the
-- "hold" — so the same dollars can never also be spent on an entry. Stripe
-- transfers (or a recorded manual payment) then move real money out of the
-- pool. Canceling/failing a request releases the hold with a paired credit.

-- ---------------------------------------------------------------------------
-- Stripe Connect Express accounts (one per user, created on first cash-out)
-- ---------------------------------------------------------------------------

create table if not exists public.stripe_connect_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_account_id text not null unique,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stripe_connect_accounts is
  'Stripe Connect Express account per user for wallet cash-outs. Status mirrors Stripe (account.updated webhook + on-demand refresh).';

alter table public.stripe_connect_accounts enable row level security;

drop policy if exists stripe_connect_accounts_select_own on public.stripe_connect_accounts;
create policy stripe_connect_accounts_select_own
  on public.stripe_connect_accounts for select to authenticated
  using (user_id = auth.uid());

-- Writes: service role only (no authenticated insert/update/delete policies).

-- ---------------------------------------------------------------------------
-- Payout requests (the queue + permanent audit trail)
-- ---------------------------------------------------------------------------

create table if not exists public.wallet_payout_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Gross amount debited from the wallet.
  amount_cents bigint not null check (amount_cents > 0),
  -- Processing fee kept by Peer Racing (covers Connect costs).
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  -- What actually reaches the racer (amount - fee).
  net_cents bigint not null check (net_cents > 0),
  method text not null check (method in ('stripe', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'canceled', 'failed')),
  stripe_transfer_id text null,
  -- Manual escape hatch (cash at the race, Cash App, check for minors etc.)
  manual_method text null,
  manual_reference text null,
  note text null,
  failure_reason text null,
  requested_at timestamptz not null default now(),
  paid_at timestamptz null,
  canceled_at timestamptz null,
  -- Admin who recorded a manual payout or canceled a request.
  processed_by uuid null references auth.users (id) on delete set null
);

comment on table public.wallet_payout_requests is
  'Wallet cash-outs. Wallet is debited (hold) at request time; paid via Stripe transfer or admin-recorded manual payment; canceled/failed requests release the hold.';

create index if not exists wallet_payout_requests_user_idx
  on public.wallet_payout_requests (user_id, requested_at desc);
create index if not exists wallet_payout_requests_status_idx
  on public.wallet_payout_requests (status, requested_at desc);

alter table public.wallet_payout_requests enable row level security;

drop policy if exists wallet_payout_requests_select_own on public.wallet_payout_requests;
create policy wallet_payout_requests_select_own
  on public.wallet_payout_requests for select to authenticated
  using (user_id = auth.uid());

-- Writes: service role only.

-- ---------------------------------------------------------------------------
-- Ledger idempotency: at most one hold and one release per payout request
-- ---------------------------------------------------------------------------

create unique index if not exists wallet_ledger_payout_hold_uidx
  on public.wallet_ledger ((metadata->>'payout_request_id'))
  where category = 'bank_withdrawal' and (metadata->>'payout_request_id') is not null;

create unique index if not exists wallet_ledger_payout_release_uidx
  on public.wallet_ledger ((metadata->>'payout_release_for'))
  where category = 'adjustment' and (metadata->>'payout_release_for') is not null;

-- ---------------------------------------------------------------------------
-- Atomic hold: balance-checked debit at request time (mirrors the race-entry
-- debit RPC: advisory lock per user prevents concurrent overdraw).
-- ---------------------------------------------------------------------------

create or replace function public.wallet_apply_payout_hold(
  p_user_id uuid,
  p_amount_cents bigint,
  p_request_id uuid,
  p_label text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bal bigint;
  has_source boolean;
begin
  if p_amount_cents <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_ledger'
      and column_name = 'source'
  ) into has_source;

  perform pg_advisory_xact_lock(abs(hashtext(p_user_id::text))::bigint);

  select coalesce(sum(amount_cents), 0) into bal
  from wallet_ledger
  where user_id = p_user_id;

  if bal < p_amount_cents then
    raise exception 'insufficient_wallet_balance' using errcode = 'P0001';
  end if;

  if has_source then
    insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata, source)
    values (
      p_user_id,
      -p_amount_cents,
      'bank_withdrawal',
      coalesce(nullif(trim(p_label), ''), 'Cash out'),
      jsonb_build_object('payout_request_id', p_request_id::text),
      'bank_withdrawal'
    );
  else
    insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata)
    values (
      p_user_id,
      -p_amount_cents,
      'bank_withdrawal',
      coalesce(nullif(trim(p_label), ''), 'Cash out'),
      jsonb_build_object('payout_request_id', p_request_id::text)
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Release a hold (canceled or failed request). Idempotent: the paired-credit
-- unique index makes a second release a no-op error we swallow here.
-- ---------------------------------------------------------------------------

create or replace function public.wallet_release_payout_hold(
  p_user_id uuid,
  p_amount_cents bigint,
  p_request_id uuid,
  p_label text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  has_source boolean;
begin
  if p_amount_cents <= 0 then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wallet_ledger'
      and column_name = 'source'
  ) into has_source;

  begin
    if has_source then
      insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata, source)
      values (
        p_user_id,
        p_amount_cents,
        'adjustment',
        coalesce(nullif(trim(p_label), ''), 'Cash out canceled'),
        jsonb_build_object('payout_release_for', p_request_id::text),
        'adjustment'
      );
    else
      insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata)
      values (
        p_user_id,
        p_amount_cents,
        'adjustment',
        coalesce(nullif(trim(p_label), ''), 'Cash out canceled'),
        jsonb_build_object('payout_release_for', p_request_id::text)
      );
    end if;
  exception when unique_violation then
    -- Hold already released for this request; nothing to do.
    null;
  end;
end;
$$;

revoke all on function public.wallet_apply_payout_hold(uuid, bigint, uuid, text) from public;
revoke all on function public.wallet_release_payout_hold(uuid, bigint, uuid, text) from public;

grant execute on function public.wallet_apply_payout_hold(uuid, bigint, uuid, text) to service_role;
grant execute on function public.wallet_release_payout_hold(uuid, bigint, uuid, text) to service_role;

notify pgrst, 'reload schema';
