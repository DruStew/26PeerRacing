-- If you added kiosk_checked_in_at earlier but the REST API still reports "schema cache",
-- this reloads PostgREST so it picks up the column. Safe to run multiple times.
notify pgrst, 'reload schema';
