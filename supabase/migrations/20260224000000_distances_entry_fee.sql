-- Entry fee per race (distance). Default $0. Will eventually tie to racer wallet.
alter table distances
  add column if not exists entry_fee_cents integer not null default 0;

comment on column distances.entry_fee_cents is 'Entry fee for this race in cents. Default 0. Used for paid entries; ties to wallet later.';
