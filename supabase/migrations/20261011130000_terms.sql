-- The Terms everyone accepts before they use Voltrix or Voltrix Coach (Ryan, 2026-10-11).
--
--   * Both apps show the Terms of Service, the Health and Safety Notice, the Community Rules and the
--     Privacy page before anything else, and ask for three ticks: "I am 18 or older", "I accept the
--     Terms" and "I understand the health and safety risks". A new version of the Terms asks again.
--   * Each acceptance is kept as proof (public.terms_acceptances): who, which version, which app,
--     which boxes were ticked, the kind of device, and when. The person can read their own records
--     and never change or remove them. Records are added only by accept_terms() (a signed-in person)
--     and by handle_new_user() at sign-up, from what the app sent with the sign-up.
--   * Records are kept after the account is deleted, only for as long as Voltrix may need them to
--     answer a claim (prescription of most debts: three years, Prescription Act 68 of 1969,
--     s11(d)). There is no foreign key to the account, so deleting it doesn't take the records
--     with it; a trigger on auth.users notes when the account went and the email address it had,
--     and tidy_terms_proof() (every night, through Supabase Cron) de-identifies the records three
--     years after that (POPIA s14(4) allows de-identifying in place of destroying).
--   * profiles.terms_version and terms_accepted_at say which version the account accepted last
--     and when, for the apps (readable by the account only, like the rest of the row).
--   * The versions are kept on the server: the ones published (private.terms_versions) and the current
--     one (private.settings 'terms_version', read through current_terms_version()). Only a published
--     version is recorded. An app that knows only an older version than the current one asks the person
--     to update it, and a new version takes effect when the setting changes.
--   * A record that may be needed for a complaint, dispute or claim can be held (hold_until, set by
--     the owner with SQL only), and tidy_terms_proof() leaves it as it is until the hold ends.
--
-- Builds on round 3 (20261011120000_round3.sql). handle_new_user() is replaced with the same body
-- plus one guarded call (the sign-up record), which can never stop an account from being made.
-- Nothing here removes rows or objects.

-- ---------- 1. The account's latest acceptance ----------

-- A version is the day it took effect, 'YYYY-MM-DD', with a letter after it for a second version
-- on the same day ('2026-10-11b'), so versions sort in the order they were published.
alter table public.profiles
  add column terms_version text
    constraint profiles_terms_version_check check (terms_version is null or terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$'),
  add column terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is
  'The newest version of the Terms this account accepted. Set only by accept_terms() and at sign-up.';
comment on column public.profiles.terms_accepted_at is 'When the account accepted terms_version (database time).';

-- No update grant: the apps read these columns (the existing table grant and the profiles_select_own
-- policy) but only accept_terms() and handle_new_user() write them.

-- ---------- 2. The proof ----------

create table public.terms_acceptances (
  id bigint generated always as identity primary key,
  -- No foreign key on purpose: the record outlives the account (section 5).
  user_id uuid,
  version text not null
    constraint terms_acceptances_version_check check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$'),
  app text not null constraint terms_acceptances_app_check check (app in ('coach', 'client')),
  -- The boxes the person ticked, always {"age": true, "terms": true, "health": true}.
  checks jsonb not null
    constraint terms_acceptances_checks_check check (checks = '{"age": true, "terms": true, "health": true}'::jsonb),
  platform text not null constraint terms_acceptances_platform_check check (platform in ('ios', 'android', 'web', 'other')),
  -- 'sign_up': sent with the sign-up and recorded as the account was made; 'app': accept_terms().
  via text not null constraint terms_acceptances_via_check check (via in ('sign_up', 'app')),
  -- When the database recorded it.
  accepted_at timestamptz not null default now(),
  -- When the person ticked the boxes, by their phone's clock (earlier when they accepted offline, or
  -- before signing up). Kept only when it is within a year before the record and not in the future.
  device_time timestamptz,
  -- Set when the account is deleted (section 5).
  account_deleted_at timestamptz,
  account_email text constraint terms_acceptances_account_email_check check (account_email is null or char_length(account_email) <= 320),
  -- Keep the record exactly as it is until this time (section 6): a complaint, dispute or claim is
  -- open, or one can still be brought. Set only by the owner, with SQL (hold_terms_proof()).
  hold_until timestamptz
);

comment on table public.terms_acceptances is
  'Proof that a person accepted a version of the Terms. Kept after the account is deleted and de-identified three years later (tidy_terms_proof), unless held (hold_until).';
comment on column public.terms_acceptances.hold_until is
  'Keep this record as it is until then (an open complaint, dispute or claim). Owner only, with SQL: hold_terms_proof().';

-- One record per account, version, app and kind of device: accepting the same version again on the
-- same kind of device adds nothing. Only published versions are recorded (section 3), so an account
-- adds at most 8 records per published version (2 apps, 4 kinds of device), and made-up versions none.
create unique index terms_acceptances_once on public.terms_acceptances (user_id, version, app, platform);
create index terms_acceptances_deleted_idx on public.terms_acceptances (account_deleted_at)
  where account_deleted_at is not null;

alter table public.terms_acceptances enable row level security;

revoke all on public.terms_acceptances from anon, authenticated;
-- The person reads their own records. account_deleted_at and account_email are only ever set once
-- the account is gone, so they are left out.
grant select (id, user_id, version, app, checks, platform, via, accepted_at, device_time)
  on public.terms_acceptances to authenticated;

create policy terms_acceptances_select_own on public.terms_acceptances
  for select to authenticated using (user_id = (select auth.uid()));

-- No insert, update or delete grants or policies: records are added only by the functions below,
-- and nobody using the apps can change or remove one.

-- ---------- 3. Which versions exist, and the current one ----------

-- A version is 'YYYY-MM-DD', the day it takes effect (a letter after it for a second version on the
-- same day). Two things on the server say which versions exist:
--   * private.terms_versions: every version published, from the day the builds that carry its text can
--     reach people. Only these, and the current one, are recorded, so the proof holds real versions only
--     and nobody can fill the table with made-up ones.
--   * private.settings 'terms_version': the current version, the one everyone must have accepted. The
--     apps compare it with the version they carry: an app that only knows an older one asks the person to
--     update it, and nobody is asked for a newer one until this changes. It is always accepted too.
-- Publishing a new version (the owner, with SQL in the Supabase SQL editor):
--   1. Put its text in the apps, with TERMS_VERSION the day it takes effect (for example '2026-12-01').
--   2. insert into private.terms_versions (version) values ('2026-12-01');
--      From then on a sign-up or an acceptance of it is recorded, so a new build can go out early.
--   3. Ship the builds, and give the 20 business days' notice the Terms promise for changes that affect
--      people's rights.
--   4. On the day it takes effect:
--      update private.settings set value = '2026-12-01' where name = 'terms_version';
--      Everyone is then asked to accept it, and an older build asks to be updated.
-- A build whose version isn't published yet still works: accept_terms() answers VT001, and the apps keep
-- the record on the phone and send it once the version is published.
-- private.settings is made by 20261008170000_clean_expired_stories.sql (the same definition here, so
-- this file also builds on a database without the cron jobs; nothing changes where it exists).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.settings (
  name text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;

insert into private.settings (name, value)
values ('terms_version', '2026-10-11')
on conflict (name) do nothing;

create table private.terms_versions (
  version text primary key
    constraint terms_versions_version_check check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$'),
  -- When it was added to this list.
  published_at timestamptz not null default now()
);
revoke all on private.terms_versions from public, anon, authenticated;

comment on table private.terms_versions is
  'Every published version of the Terms. Only these, and private.settings terms_version, are recorded in public.terms_acceptances. Add a row when the builds that carry a new version ship.';

insert into private.terms_versions (version)
values ('2026-10-11')
on conflict (version) do nothing;

-- Whether a version may be recorded: published, or the current one.
create or replace function public.terms_published(p_version text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_version is not null
      and (exists (select 1 from private.terms_versions t where t.version = p_version)
           or p_version = (select s.value from private.settings s where s.name = 'terms_version')),
    false);
$$;

revoke execute on function public.terms_published(text) from public, anon, authenticated;

-- Anyone may read the current version, signed in or not (the acceptance screen comes before signing
-- up). A database without this function, or without the row, answers nothing, and the apps then use
-- their own version, so nobody is locked out.
create or replace function public.current_terms_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.value from private.settings s where s.name = 'terms_version';
$$;

revoke execute on function public.current_terms_version() from public;
grant execute on function public.current_terms_version() to anon, authenticated;

-- ---------- 4. Recording an acceptance ----------

-- The one place that checks what an app sent and writes the record and the profile. p_terms is the
-- object an app sends: {"version", "app", "checks": {"age", "terms", "health"}, "platform",
-- "accepted_at"}. Answers false, without raising, when anything is missing or wrong (a version that
-- isn't published among them), so a bad sign-up payload never stops an account from being made.
create or replace function public.record_terms(p_user uuid, p_terms jsonb, p_via text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text;
  v_app text;
  v_platform text;
  v_device timestamptz;
begin
  if p_user is null or p_terms is null or jsonb_typeof(p_terms) <> 'object' then
    return false;
  end if;
  v_version := p_terms ->> 'version';
  v_app := p_terms ->> 'app';
  if v_version is null or v_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$' or v_app is null or v_app not in ('coach', 'client') then
    return false;
  end if;
  -- Only a published version (section 3). A made-up '9999-12-31' would otherwise sit above every
  -- real version on the profile for good, and made-up older ones would fill the table.
  if not public.terms_published(v_version) then
    return false;
  end if;
  -- All three boxes, each exactly true.
  if jsonb_typeof(p_terms -> 'checks') is distinct from 'object'
     or p_terms -> 'checks' -> 'age' is distinct from 'true'::jsonb
     or p_terms -> 'checks' -> 'terms' is distinct from 'true'::jsonb
     or p_terms -> 'checks' -> 'health' is distinct from 'true'::jsonb then
    return false;
  end if;
  v_platform := case when p_terms ->> 'platform' in ('ios', 'android', 'web') then p_terms ->> 'platform' else 'other' end;
  -- The phone's clock, when it reads as a time within the year before now.
  begin
    v_device := (p_terms ->> 'accepted_at')::timestamptz;
  exception when others then
    v_device := null;
  end;
  if v_device is not null and (v_device > now() + interval '5 minutes' or v_device < now() - interval '1 year') then
    v_device := null;
  end if;

  insert into public.terms_acceptances (user_id, version, app, checks, platform, via, device_time)
  values (p_user, v_version, v_app, '{"age": true, "terms": true, "health": true}'::jsonb, v_platform, p_via, v_device)
  on conflict (user_id, version, app, platform) do nothing;

  -- The profile keeps the newest version accepted (an older app sending an older version later
  -- doesn't take it back) and when that version was first accepted.
  update public.profiles p
     set terms_version = v_version,
         terms_accepted_at = now()
   where p.id = p_user
     and (p.terms_version is null or p.terms_version collate "C" < v_version collate "C");
  return true;
end;
$$;

revoke execute on function public.record_terms(uuid, jsonb, text) from public, anon, authenticated;

-- A signed-in person accepts the Terms (the acceptance screen, or a record the app kept on the
-- phone while it was offline or the database was older). Answers the account's newest accepted
-- version and when it was accepted.
create or replace function public.accept_terms(p_terms jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  answer jsonb;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = me) then
    raise exception 'Your account isn''t ready yet. Try again in a moment.' using errcode = 'P0002';
  end if;
  -- A version that isn't published (section 3; record_terms() refuses it too). VT001 tells the apps
  -- this is the server's answer, not a lost connection: they keep the record on the phone, let the
  -- person carry on while the server's current version is older, and send it again later.
  if p_terms ->> 'version' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[a-z]?$' and not public.terms_published(p_terms ->> 'version') then
    raise exception 'That version of the Terms isn''t published yet.' using errcode = 'VT001';
  end if;
  if not public.record_terms(me, p_terms, 'app') then
    raise exception 'Tick all three boxes to accept the Terms.' using errcode = '22023';
  end if;
  select jsonb_build_object('version', p.terms_version, 'accepted_at', p.terms_accepted_at)
    into answer
    from public.profiles p
   where p.id = me;
  return answer;
end;
$$;

revoke execute on function public.accept_terms(jsonb) from public, anon;
grant execute on function public.accept_terms(jsonb) to authenticated;

-- Sign-up: the same body as before (20261007194000_card_first_trial.sql) and one guarded call, which
-- records the acceptance the app sent with the sign-up (options.data.terms). A sign-up without it,
-- or with something wrong in it, makes the account exactly as before; the app then asks again. The
-- call has its own exception block, so a fault in recording (now, or after a later change) is only a
-- warning in the logs and never stops an account from being made.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    case when new.raw_user_meta_data ->> 'role' = 'client' then 'client' else 'trainer' end
  );
  begin
    perform public.record_terms(new.id, new.raw_user_meta_data -> 'terms', 'sign_up');
  exception when others then
    raise warning 'handle_new_user: the Terms acceptance of % was not recorded (%: %)', new.id, sqlstate, sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- 5. After the account is deleted ----------

-- When an account is deleted (delete_my_account(), delete_my_client_account(), or the Supabase
-- dashboard), its records stay, marked with when it went and the email address it had, so the
-- proof still says who accepted.
create or replace function public.keep_terms_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.terms_acceptances a
     set account_deleted_at = now(),
         account_email = left(old.email::text, 320)
   where a.user_id = old.id
     and a.account_deleted_at is null;
  return old;
end;
$$;

revoke execute on function public.keep_terms_proof() from public, anon, authenticated;

create trigger on_auth_user_deleted after delete on auth.users
  for each row execute function public.keep_terms_proof();

-- Every night: three years after an account was deleted, its records no longer say who accepted
-- (the account, its email address and the phone's clock are cleared, and the times are kept only to
-- the month), unless they are held (section 6): a held record waits until its hold ends. Records of
-- an account that went without the trigger seeing it start their three years now. Answers how many
-- records were de-identified.
create or replace function public.tidy_terms_proof()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  tidied integer;
begin
  update public.terms_acceptances a
     set account_deleted_at = now()
   where a.user_id is not null
     and a.account_deleted_at is null
     and not exists (select 1 from auth.users u where u.id = a.user_id);

  update public.terms_acceptances a
     set user_id = null,
         account_email = null,
         device_time = null,
         accepted_at = date_trunc('month', a.accepted_at),
         account_deleted_at = date_trunc('month', a.account_deleted_at)
   where a.account_deleted_at < now() - interval '3 years'
     and (a.hold_until is null or a.hold_until <= now())
     and (a.user_id is not null or a.account_email is not null or a.device_time is not null);
  get diagnostics tidied = row_count;
  return tidied;
end;
$$;

revoke execute on function public.tidy_terms_proof() from public, anon, authenticated;

-- ---------- 6. Holding records for a complaint, dispute or claim ----------

-- Owner only, with SQL (the Supabase SQL editor; nobody using the apps can call it): keep an account's
-- records exactly as they are, with who accepted, until p_until, while a complaint, dispute or claim
-- is open or one can still be brought (for example by someone who was under 18). Finds the records by
-- the account while it exists (p_account), or by the email address it had once it is deleted
-- (p_email, any case). A null p_until lifts the hold, and the records then follow the usual three
-- years. Answers how many records it changed. Example:
--   select public.hold_terms_proof(null, '<the email address>', '2030-01-01');
create or replace function public.hold_terms_proof(p_account uuid, p_email text, p_until timestamptz)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if p_account is null and nullif(btrim(p_email), '') is null then
    raise exception 'Name the account or its email address.' using errcode = '22023';
  end if;
  update public.terms_acceptances a
     set hold_until = p_until
   where (p_account is not null and a.user_id = p_account)
      or (nullif(btrim(p_email), '') is not null and lower(a.account_email) = lower(btrim(p_email)));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke execute on function public.hold_terms_proof(uuid, text, timestamptz) from public, anon, authenticated;

-- 03:40 in South Africa (01:40 UTC). Only where Supabase Cron is installed (the live project), so
-- the file also builds on a plain Postgres, where nothing runs it on its own (run
-- "select public.tidy_terms_proof()" by hand there). Scheduling a job with the same name again
-- updates it.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule('tidy-terms-proof', '40 1 * * *', 'select public.tidy_terms_proof()');
  end if;
end;
$$;
