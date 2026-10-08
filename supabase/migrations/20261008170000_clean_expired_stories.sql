-- Stories are gone for good 24 hours after posting (Ryan, 2026-10-08: "the story is
-- only up for 24 hours then automatically gone"). Feeds already hide a story once
-- it expires. Every hour this job calls the clean-expired-stories Edge Function,
-- which deletes expired stories and their photos and videos. Files can only be
-- removed through the storage API, which is why an Edge Function does the work.

-- Scheduled jobs (Supabase Cron) and web requests from the database.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- Every hour, on the hour. The function is deployed without a login check (it
-- only removes stories that have already expired), so no key is sent. Scheduling
-- a job with the same name again just updates it, so this can safely run twice.
select cron.schedule(
  'clean-expired-stories',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://jmnmqxhkcpcdnwlcoiuq.supabase.co/functions/v1/clean-expired-stories',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
