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

-- A random key, made when this migration runs (it is never in the code, which is
-- public), that the hourly job sends and the function checks. Only the database
-- and the function (through check_cron_key, with the service role) can read it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  name text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;

insert into private.settings (name, value)
values ('cron_key', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (name) do nothing;

create or replace function public.check_cron_key(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.settings where name = 'cron_key' and value = p_key);
$$;

revoke execute on function public.check_cron_key(text) from public, anon, authenticated;
grant execute on function public.check_cron_key(text) to service_role;

-- Every hour, on the hour. The function is deployed without Supabase's login check
-- (verify_jwt = false in supabase/config.toml) and checks the key above instead.
-- Scheduling a job with the same name again just updates it, so this can safely
-- run twice.
select cron.schedule(
  'clean-expired-stories',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://jmnmqxhkcpcdnwlcoiuq.supabase.co/functions/v1/clean-expired-stories',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from private.settings where name = 'cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
