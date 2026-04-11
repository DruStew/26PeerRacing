-- Optional cleanup if public.wallet_ledger still has MVP column "source" with NOT NULL.
-- After category/related_entry_id are canonical, you can drop the constraint so only "category" is required.
-- Safe to run once; no-op if column absent.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_ledger' and column_name = 'source'
  ) then
    alter table public.wallet_ledger alter column source drop not null;
  end if;
end $$;
