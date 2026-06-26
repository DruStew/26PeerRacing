-- Fix wallet RPCs: production DB has legacy `source text not null` but the runtime
-- information_schema check was taking the no-source insert branch, causing:
--   null value in column "source" of relation "wallet_ledger" violates not-null constraint
-- Always write source (= category) on hybrid schemas.

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
begin
  if p_amount_cents <= 0 then
    return;
  end if;

  perform pg_advisory_xact_lock(abs(hashtext(p_user_id::text))::bigint);

  select coalesce(sum(amount_cents), 0) into bal
  from wallet_ledger
  where user_id = p_user_id;

  if bal < p_amount_cents then
    raise exception 'insufficient_wallet_balance' using errcode = 'P0001';
  end if;

  insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata, source)
  values (
    p_user_id,
    -p_amount_cents,
    'entry_payment_from_wallet',
    coalesce(nullif(trim(p_label), ''), 'Race entry'),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('event_id', p_event_id),
    'entry_payment_from_wallet'
  );
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
begin
  if p_amount_cents <= 0 then
    return;
  end if;

  insert into public.wallet_ledger (user_id, amount_cents, category, label, metadata, source)
  values (
    p_user_id,
    p_amount_cents,
    'adjustment',
    coalesce(nullif(trim(p_label), ''), 'Adjustment'),
    coalesce(p_metadata, '{}'::jsonb),
    'adjustment'
  );
end;
$$;

revoke all on function public.wallet_apply_debit_for_race_entry(uuid, bigint, uuid, text, jsonb) from public;
revoke all on function public.wallet_credit_adjustment(uuid, bigint, text, jsonb) from public;

grant execute on function public.wallet_apply_debit_for_race_entry(uuid, bigint, uuid, text, jsonb) to service_role;
grant execute on function public.wallet_credit_adjustment(uuid, bigint, text, jsonb) to service_role;

notify pgrst, 'reload schema';
