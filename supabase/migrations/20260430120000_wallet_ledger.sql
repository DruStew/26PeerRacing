-- Peer Racing wallet: append-only ledger (credits positive; debits negative in amount_cents).
-- Authenticated users read their own rows; writes via service role only.

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_cents bigint not null,
  category text not null
    check (category in (
      'entry_withdrawal_credit',
      'race_payout',
      'membership_credit',
      'bank_withdrawal',
      'entry_payment_from_wallet',
      'adjustment'
    )),
  label text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  related_entry_id uuid null,
  created_at timestamptz not null default now()
);

comment on table public.wallet_ledger is 'Wallet ledger; amount_cents positive credits the user, negative debits.';
comment on column public.wallet_ledger.related_entry_id is 'Optional reference (e.g. entry id before delete) for idempotency; not an FK.';
comment on column public.wallet_ledger.amount_cents is 'Net cents applied to wallet (after fees where applicable).';

create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger (user_id, created_at desc);

create unique index if not exists wallet_ledger_entry_withdrawal_uidx
  on public.wallet_ledger (related_entry_id)
  where category = 'entry_withdrawal_credit' and related_entry_id is not null;

alter table public.wallet_ledger enable row level security;

drop policy if exists wallet_ledger_select_own on public.wallet_ledger;
create policy wallet_ledger_select_own
  on public.wallet_ledger for select to authenticated
  using (user_id = auth.uid());

-- Inserts/updates/deletes: service role only (no policy for authenticated)

alter table public.entries
  add column if not exists paid_amount_cents integer null;

comment on column public.entries.paid_amount_cents is 'Gross cents charged for this entry (paid rows); used for wallet credit net of Stripe fees on withdraw.';
