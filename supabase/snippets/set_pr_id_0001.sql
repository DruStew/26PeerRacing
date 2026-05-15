-- One-time: set your lifetime pr_id (bib # / Peer Racing ID) to 0001 (founder / reserved band).
-- Replace the email if needed, then run in Supabase SQL editor.
update public.profiles p
set pr_id = '0001'
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('drujstew@gmail.com');
