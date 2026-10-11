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
--
-- Builds on round 3 (20261011120000_round3.sql). handle_new_user() is replaced with the same body
-- plus one line (the sign-up record). Nothing here removes rows or objects.

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
  -- No foreign key on purpose: the record outlives the account (section 4).
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
  -- Set when the account is deleted (section 4).
  account_deleted_at timestamptz,
  account_email text constraint terms_acceptances_account_email_check check (account_email is null or char_length(account_email) <= 320)
);

comment on table public.terms_acceptances is
  'Proof that a person accepted a version of the Terms. Kept after the account is deleted and de-identified three years later (tidy_terms_proof).';

-- One record per account, version, app and kind of device: accepting the same version again on the
-- same kind of device adds nothing, so the table can't be flooded.
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

-- ---------- 3. Recording an acceptance ----------

-- The one place that checks what an app sent and writes the record and the profile. p_terms is the
-- object an app sends: {"version", "app", "checks": {"age", "terms", "health"}, "platform",
-- "accepted_at"}. Answers false, without raising, when anything is missing or wrong, so a bad
-- sign-up payload never stops an account from being made.
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

-- Sign-up: the same body as before (20261007194000_card_first_trial.sql) and one more line, which
-- records the acceptance the app sent with the sign-up (options.data.terms). A sign-up without it,
-- or with something wrong in it, makes the account exactly as before; the app then asks again.
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
  perform public.record_terms(new.id, new.raw_user_meta_data -> 'terms', 'sign_up');
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------- 4. After the account is deleted ----------

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
-- the month). Records of an account that went without the trigger seeing it start their three years
-- now. Answers how many records were de-identified.
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
     and (a.user_id is not null or a.account_email is not null or a.device_time is not null);
  get diagnostics tidied = row_count;
  return tidied;
end;
$$;

revoke execute on function public.tidy_terms_proof() from public, anon, authenticated;

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
