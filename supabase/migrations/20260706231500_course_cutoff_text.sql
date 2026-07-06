-- Course cutoff becomes promoter free text (e.g. "14 hours" or "8:00 PM at mile 90")
-- instead of a strict timestamp. The old course_cutoff_at column stays for legacy
-- rows but is no longer written by the promoter UI.

alter table public.distances
  add column if not exists course_cutoff_text text;

comment on column public.distances.course_cutoff_text is
  'Free-text on-course cutoff shown on the race day sheet (replaces course_cutoff_at).';
