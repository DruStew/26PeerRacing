-- Public contact form: optional organizer override + audit log for Peer Racing oversight.

alter table public.events
  add column if not exists organizer_contact_name text null,
  add column if not exists organizer_contact_email text null;

comment on column public.events.organizer_contact_name is
  'Display name for race-day / registration questions (e.g. Green Country Trails RD).';
comment on column public.events.organizer_contact_email is
  'Optional override for contact-form delivery. When null, promoter profile email is used.';

create table if not exists public.event_contact_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  sender_name text not null,
  sender_email text not null,
  sender_user_id uuid null references auth.users(id) on delete set null,
  topic text not null check (topic in ('withdrawal', 'transfer', 'bib', 'registration', 'other')),
  message text not null,
  ip_hash text null,
  created_at timestamptz not null default now()
);

create index if not exists event_contact_messages_event_id_idx
  on public.event_contact_messages (event_id, created_at desc);

create index if not exists event_contact_messages_sender_email_idx
  on public.event_contact_messages (sender_email, created_at desc);

alter table public.event_contact_messages enable row level security;

-- Promoters read messages for their events; admins read all.
drop policy if exists event_contact_messages_select_promoter on public.event_contact_messages;
create policy event_contact_messages_select_promoter
  on public.event_contact_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_contact_messages.event_id
        and e.promoter_id = auth.uid()
    )
    or exists (
      select 1 from public.roles r
      where r.user_id = auth.uid()
        and r.role in ('admin', 'super_admin')
    )
  );

comment on table public.event_contact_messages is
  'Audit log of public contact-form submissions; email also sent to promoter and Peer Racing inbox.';
