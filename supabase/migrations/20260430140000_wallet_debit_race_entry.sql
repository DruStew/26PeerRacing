-- Atomic wallet debit for race entry (service role / RPC); optional reversal adjustment.
-- Inserts include legacy "source" when that column exists (hybrid MVP + app schema).

alter table public.stripe_pending_race_entries
  add column if not exists wallet_debit_completed_at timestamptz null;

comment on column public.stripe_pending_race_entries.wallet_debit_completed_at is
  'Set after wallet balance was debited for this checkout; used to avoid double-debit on webhook retry.';

create or replace function public.wallet_apply_debit_for_race_entry(
  p_user_id uuid,
  p_amount_cents bigint,
  p_event_id uuid,
  p_label text,
  p_metadata jsonb default '{}'::jsonb
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
    return;
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
      'entry_payment_from_wallet',
      coalesce(nullif(trim(p_label), ''), 'Race entry'),
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('event_id', p_event_id),
      'entry_payment_from_wallet'
    );
  else
    insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata)
    values (
      p_user_id,
      -p_amount_cents,
      'entry_payment_from_wallet',
      coalesce(nullif(trim(p_label), ''), 'Race entry'),
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('event_id', p_event_id)
    );
  end if;
end;
$$;

create or replace function public.wallet_credit_adjustment(
  p_user_id uuid,
  p_amount_cents bigint,
  p_label text,
  p_metadata jsonb default '{}'::jsonb
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

  if has_source then
    insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata, source)
    values (
      p_user_id,
      p_amount_cents,
      'adjustment',
      coalesce(nullif(trim(p_label), ''), 'Adjustment'),
      coalesce(p_metadata, '{}'::jsonb),
      'adjustment'
    );
  else
    insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata)
    values (
      p_user_id,
      p_amount_cents,
      'adjustment',
      coalesce(nullif(trim(p_label), ''), 'Adjustment'),
      coalesce(p_metadata, '{}'::jsonb)
    );
  end if;
end;
$$;

revoke all on function public.wallet_apply_debit_for_race_entry(uuid, bigint, uuid, text, jsonb) from public;
revoke all on function public.wallet_credit_adjustment(uuid, bigint, text, jsonb) from public;

grant execute on function public.wallet_apply_debit_for_race_entry(uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.wallet_credit_adjustment(uuid, bigint, text, jsonb) to service_role;
