-- Align legacy public.wallet_ledger (MVP: source, ref_id, no category) with the app schema.
-- Later migration 20260430120000_wallet_ledger.sql uses CREATE TABLE IF NOT EXISTS, so if this table
-- already existed from MVP, new columns were never added.

do $mig$
begin
  if to_regclass('public.wallet_ledger') is not null then
    alter table public.wallet_ledger add column if not exists category text;
    alter table public.wallet_ledger add column if not exists label text;
    alter table public.wallet_ledger add column if not exists metadata jsonb;
    alter table public.wallet_ledger add column if not exists related_entry_id uuid;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'wallet_ledger' and column_name = 'source'
    ) then
      update public.wallet_ledger
      set category = trim(both from source::text)
      where category is null and source is not null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'wallet_ledger' and column_name = 'ref_id'
    ) then
      update public.wallet_ledger
      set related_entry_id = ref_id
      where related_entry_id is null and ref_id is not null;
    end if;

    update public.wallet_ledger set label = coalesce(label, '');
    alter table public.wallet_ledger alter column label set default '';
    begin
      alter table public.wallet_ledger alter column label set not null;
    exception when others then null;
    end;

    update public.wallet_ledger set metadata = coalesce(metadata, '{}'::jsonb);
    alter table public.wallet_ledger alter column metadata set default '{}'::jsonb;
    begin
      alter table public.wallet_ledger alter column metadata set not null;
    exception when others then null;
    end;

    update public.wallet_ledger
    set category = 'adjustment'
    where category is null or trim(both from coalesce(category, '')) = '';

    update public.wallet_ledger
    set category = 'adjustment'
    where category not in (
      'entry_withdrawal_credit',
      'race_payout',
      'membership_credit',
      'bank_withdrawal',
      'entry_payment_from_wallet',
      'adjustment'
    );

    begin
      alter table public.wallet_ledger alter column category set not null;
    exception when others then null;
    end;

    if not exists (
      select 1 from pg_constraint where conname = 'wallet_ledger_category_check'
    ) then
      alter table public.wallet_ledger add constraint wallet_ledger_category_check check (category in (
        'entry_withdrawal_credit',
        'race_payout',
        'membership_credit',
        'bank_withdrawal',
        'entry_payment_from_wallet',
        'adjustment'
      ));
    end if;

    create unique index if not exists wallet_ledger_entry_withdrawal_uidx
      on public.wallet_ledger (related_entry_id)
      where category = 'entry_withdrawal_credit' and related_entry_id is not null;
  end if;
end $mig$;
