-- Round 2 of "all the ideas to make Voltrix better" (Ryan, 2026-10-10): the trainer's day.
--
--   * Prices and earnings. A trainer sets their country, currency (rand unless they pick another)
--     and usual session price, and may give a client their own rate. Each session keeps the price
--     and currency it was booked at; the database fills them in when the app sends no price, so
--     app versions already on phones get priced bookings too, and changing a price later never
--     rewrites what was earned. Earned = the prices of sessions marked done (session_totals()).
--     Clients never see prices: the functions the Voltrix app reads sessions through list their
--     columns, and none of them changes here.
--   * No-shows. A session can only be marked done or a no-show once it has started (15 minutes'
--     grace for a phone clock), the time of the mark is kept, and clients_overview() counts
--     no-shows per client (all time and the last 30 days).
--   * Who needs you today. clients_overview() gives Voltrix Coach every client in one call:
--     sessions, the plan this week and, only while the trainer may read them (coached_user(), the
--     round 1 rule), the client's last workout, ticks and check-ins waiting for a reply.
--   * WhatsApp invites. A trainer can invite a client whose email they don't have with an
--     8-character invite code in a WhatsApp message (invite_code(), invite_shared()). The person
--     types it in Voltrix, sees the round 1 invite card and accepts it (invite_by_code(),
--     accept_invite_code()). Codes need a confirmed email, work only on a waiting invite, last
--     30 days from the last share, keep the round 1 lock, and a person gets 10 wrong codes an
--     hour. Email invites work as before.
--   * Programs and templates. A program is weeks of workouts on weekdays, with its own copies of
--     its workouts. Trainers start from Voltrix templates, save a workout or a client's program as
--     a template, and give either to a client. Giving copies the workouts for that client, so
--     changing one client's plan never changes another's or the template. Plan workouts can start
--     and end on a date; my_plan() keeps its columns and leaves out what isn't running in the
--     days asked for, my_plan_v2() adds the program, and ticks only land on days a workout runs.
--   * Live news. Linked clients hear 'session' and 'plan' on their inbox when their bookings or
--     plan change, so an open Voltrix app updates.
--
-- Nothing here removes data. Every new table is cleaned up by "on delete cascade" to profiles,
-- clients, workouts or programs, so delete_my_account() works as it is, and nothing new refers to
-- exercises (Voltrix templates name their exercises instead).

-- ---------- 1. Prices, no-shows and earnings ----------

-- The trainer's country (for phone numbers in WhatsApp links), the currency they charge in and
-- their usual price for one session, in cents (R400 is 40000). No price means none set yet.
alter table public.profiles
  add column country text not null default 'ZA'
    constraint profiles_country_check check (country ~ '^[A-Z]{2}$'),
  add column currency text not null default 'ZAR'
    constraint profiles_currency_check check (currency ~ '^[A-Z]{3}$'),
  add column session_price_cents integer
    constraint profiles_session_price_check
      check (session_price_cents is null or session_price_cents between 0 and 10000000);

grant update (country, currency, session_price_cents) on public.profiles to authenticated;

-- A client's own rate when it differs from the usual price (null: the usual price). The invite
-- code columns are written only by the functions in section 2.
alter table public.clients
  add column session_price_cents integer
    constraint clients_session_price_check
      check (session_price_cents is null or session_price_cents between 0 and 10000000),
  add column invite_code text
    constraint clients_invite_code_check check (invite_code is null or invite_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  add column invite_code_at timestamptz,
  add column invite_shared_at timestamptz;

grant insert (session_price_cents), update (session_price_cents) on public.clients to authenticated;

create unique index clients_invite_code_key on public.clients (invite_code) where invite_code is not null;

-- What the session costs, kept from when it was booked, and in which currency (the database
-- fills the currency). Null: no price was known (time blocked off, or booked before any price
-- was set). 0 is a free session. marked_at: when it was last marked done, no-show or cancelled.
alter table public.sessions
  add column price_cents integer
    constraint sessions_price_check check (price_cents is null or price_cents between 0 and 10000000),
  add column currency text
    constraint sessions_currency_check check (currency is null or currency ~ '^[A-Z]{3}$'),
  add column marked_at timestamptz,
  add constraint sessions_price_currency_check check ((price_cents is null) = (currency is null));

grant insert (price_cents), update (price_cents) on public.sessions to authenticated;

-- Before a session is saved:
--   * one that gets a client (booked, or given a client later) with no price takes the client's
--     rate, else the usual price; a price the app sends, 0 included, is kept;
--   * a price is tagged with the trainer's currency when it is set or changed;
--   * "done" or "no-show" is refused before the session has started;
--   * marked_at follows the status.
-- Runs as the person saving, so it reads only their own client and profile.
create function public.sessions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price_cents is null and new.client_id is not null
     and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    select coalesce(c.session_price_cents, p.session_price_cents) into new.price_cents
      from public.clients c
      join public.profiles p on p.id = c.trainer_id
     where c.id = new.client_id
       and c.trainer_id = new.trainer_id;
  end if;
  if new.price_cents is null then
    new.currency := null;
  elsif tg_op = 'INSERT' or new.price_cents is distinct from old.price_cents or old.currency is null then
    new.currency := coalesce((select p.currency from public.profiles p where p.id = new.trainer_id), 'ZAR');
  else
    new.currency := old.currency;
  end if;
  if new.status in ('completed', 'no_show')
     and new.starts_at > now() + interval '15 minutes'
     and (tg_op = 'INSERT' or new.status is distinct from old.status or new.starts_at is distinct from old.starts_at) then
    raise exception 'A session can be marked done or as a no-show once it has started.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.marked_at := case when new.status = 'scheduled' then null else now() end;
  else
    new.marked_at := old.marked_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.sessions_before_write() from public, anon, authenticated;

create trigger sessions_before_write before insert or update on public.sessions
  for each row execute function public.sessions_before_write();

-- "Use your prices": gives the signed-in trainer's sessions with a client and no price, from
-- p_from to p_to (at most about 13 months), the client's rate or the usual price as they are
-- now. Returns how many sessions got a price. Sessions with a price are never changed.
create function public.fill_session_prices(p_from timestamptz, p_to timestamptz)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  filled integer;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'Pick up to a year of sessions.' using errcode = '22023';
  end if;
  update public.sessions s
     set price_cents = x.price
    from (
      select c.id, coalesce(c.session_price_cents, p.session_price_cents) as price
        from public.clients c
        join public.profiles p on p.id = c.trainer_id
       where c.trainer_id = auth.uid()
    ) x
   where s.trainer_id = auth.uid()
     and s.client_id = x.id
     and s.price_cents is null
     and x.price is not null
     and s.starts_at >= p_from
     and s.starts_at < p_to;
  get diagnostics filled = row_count;
  return filled;
end;
$$;

revoke execute on function public.fill_session_prices(timestamptz, timestamptz) from public, anon;
grant execute on function public.fill_session_prices(timestamptz, timestamptz) to authenticated;

-- The signed-in trainer's sessions from p_from to p_to (at most about 13 months; one client with
-- p_client), counted by status, by whether they have ended and by currency, with the sum of
-- their kept prices. unpriced counts those with no price (they add nothing to cents). Time
-- blocked off without a client is left out unless it was given a price.
create function public.session_totals(p_from timestamptz, p_to timestamptz, p_client uuid default null)
returns table (
  status text,
  past boolean,
  currency text,
  sessions integer,
  unpriced integer,
  cents bigint
)
language sql
stable
set search_path = ''
as $$
  select s.status,
         s.starts_at + make_interval(mins => s.duration_minutes) <= now(),
         coalesce(s.currency, p.currency),
         (count(*))::int,
         (count(*) - count(s.price_cents))::int,
         (coalesce(sum(s.price_cents), 0))::bigint
    from public.sessions s
    join public.profiles p on p.id = s.trainer_id
   where auth.uid() is not null
     and s.trainer_id = auth.uid()
     and p_to > p_from
     and p_to - p_from <= interval '400 days'
     and s.starts_at >= p_from
     and s.starts_at < p_to
     and (s.client_id is not null or s.price_cents is not null)
     and (p_client is null or s.client_id = p_client)
   group by 1, 2, 3;
$$;

revoke execute on function public.session_totals(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.session_totals(timestamptz, timestamptz, uuid) to authenticated;

-- ---------- 2. WhatsApp invites with a code ----------

-- Wrong codes per person, for the limit of 10 an hour. Only the functions below use it.
create table public.invite_code_tries (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  tries smallint not null default 0 check (tries between 0 and 100)
);

alter table public.invite_code_tries enable row level security;
revoke all on public.invite_code_tries from anon, authenticated;

-- 8 characters from Crockford's alphabet (no I, L, O or U, so nothing reads as another letter):
-- 40 random bits from the bytes of a version 4 uuid that are all random.
create function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', get_byte(r.b, i) % 32 + 1, 1), '' order by i)
    from (select uuid_send(gen_random_uuid()) as b) r
   cross join unnest(array[0, 1, 2, 3, 4, 5, 9, 10]) as i;
$$;

revoke execute on function public.new_invite_code() from public, anon, authenticated;

-- The invite code for one of the signed-in trainer's clients who isn't linked, to put in a
-- WhatsApp message: the same code while it works, otherwise a new one. Getting the code changes
-- nothing else; invite_shared() records the share. Refused for an archived or linked client, and
-- for a row whose person deleted their Voltrix account (the trainer adds them as a new client).
create function public.invite_code(p_client uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cl public.clients;
  code text;
  attempts int := 0;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into cl from public.clients c
   where c.id = p_client and c.trainer_id = me and c.status <> 'archived'
   for update;
  if cl.id is null then
    raise exception 'This client can''t be invited.' using errcode = '22023';
  end if;
  if cl.user_id is not null then
    raise exception 'This client is already connected to you.' using errcode = '22023';
  end if;
  if cl.last_user_id is not null and not exists (
    select 1 from auth.users u where u.id = cl.last_user_id and u.email_confirmed_at is not null
  ) then
    raise exception 'The person who joined as this client deleted their Voltrix account. Add them again as a new client.'
      using errcode = '22023';
  end if;
  if cl.invite_code is not null and cl.invite_code_at > now() - interval '30 days' then
    return cl.invite_code;
  end if;
  loop
    attempts := attempts + 1;
    code := public.new_invite_code();
    begin
      update public.clients c set invite_code = code, invite_code_at = now() where c.id = p_client;
      return code;
    exception when unique_violation then
      if attempts >= 5 then
        raise;
      end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.invite_code(uuid) from public, anon;
grant execute on function public.invite_code(uuid) to authenticated;

-- The trainer just shared an invite (WhatsApp, another app, or copied it). Notes the time, gives
-- a working code another 30 days, and makes a client who declined or left waiting again (a new
-- invite, as invite_client_again() does; only that same person can take a row someone left).
-- Returns the time, or null when the client isn't theirs, is archived or linked, or their person
-- deleted their account.
create function public.invite_shared(p_client uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  shared timestamptz;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.clients c
     set invite_shared_at = now(),
         invite_code_at = case when c.invite_code is not null and c.invite_code_at > now() - interval '30 days'
                               then now() else c.invite_code_at end,
         invite_status = case when c.invite_status in ('declined', 'left') then 'waiting' else c.invite_status end,
         invited_at = case when c.invite_status in ('declined', 'left') then now() else c.invited_at end,
         invite_answered_at = case when c.invite_status in ('declined', 'left') then null else c.invite_answered_at end
   where c.id = p_client
     and c.trainer_id = me
     and c.user_id is null
     and c.status <> 'archived'
     and (c.last_user_id is null or exists (
       select 1 from auth.users u where u.id = c.last_user_id and u.email_confirmed_at is not null
     ))
  returning c.invite_shared_at into shared;
  return shared;
end;
$$;

revoke execute on function public.invite_shared(uuid) from public, anon;
grant execute on function public.invite_shared(uuid) to authenticated;

-- The client row a code opens for the signed-in person, or null. Spaces, dashes and case don't
-- matter, and O, I and L read as 0, 1 and 1. The person needs a confirmed email, as for email
-- invites. A wrong code counts towards the limit of 10 an hour; past it every code is refused
-- for the rest of the hour. Opens only a waiting invite: not a trainer's own client, a linked or
-- archived row, a row someone else was linked to (the round 1 lock), or a code older than 30 days.
create function public.invite_code_client(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  code text := translate(upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g')), 'OIL', '011');
  used smallint;
  started timestamptz;
  found_id uuid;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users u where u.id = me and u.email_confirmed_at is not null) then
    raise exception 'Confirm your email first, then enter the code.' using errcode = '22023';
  end if;
  insert into public.invite_code_tries (user_id) values (me) on conflict (user_id) do nothing;
  select t.tries, t.window_started_at into used, started
    from public.invite_code_tries t
   where t.user_id = me
   for update;
  if started < now() - interval '1 hour' then
    used := 0;
    update public.invite_code_tries t set tries = 0, window_started_at = now() where t.user_id = me;
  end if;
  if used >= 10 then
    raise exception 'Too many tries. Wait an hour, then try again.' using errcode = '22023';
  end if;
  if code ~ '^[0-9A-HJKMNP-TV-Z]{8}$' then
    select c.id into found_id
      from public.clients c
     where c.invite_code = code
       and c.invite_code_at > now() - interval '30 days'
       and c.invite_status = 'waiting'
       and c.user_id is null
       and c.status <> 'archived'
       and c.trainer_id <> me
       and (c.last_user_id is null or c.last_user_id = me)
     for update;
  end if;
  if found_id is null then
    update public.invite_code_tries t set tries = least(t.tries + 1, 100) where t.user_id = me;
  end if;
  return found_id;
end;
$$;

revoke execute on function public.invite_code_client(text) from public, anon, authenticated;

-- What the invite card shows for a code, as one value: the same fields as my_invites(), then the
-- first name the trainer gave this client, so someone who got a code meant for another person can
-- tell ("Invited as Lebo"). Null when the code doesn't open an invite (it counts as a wrong try);
-- {"already_connected": true} when the person is already linked to that trainer.
-- Always exactly one value and no error once a code is looked up: whatever a caller asks of the
-- answer (one object, a row limit, a cap on rows affected), it can't make a wrong try roll back
-- without also hiding whether the code worked.
create function public.invite_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_id uuid := public.invite_code_client(p_code);
  card jsonb;
begin
  if found_id is null then
    return null;
  end if;
  select case
           when exists (
             select 1 from public.clients l where l.trainer_id = c.trainer_id and l.user_id = me and l.status <> 'archived'
           ) then jsonb_build_object('already_connected', true)
           else jsonb_build_object(
             'client_id', c.id,
             'trainer_id', c.trainer_id,
             'trainer_name', p.full_name,
             'business_name', p.business_name,
             'trainer_avatar', p.avatar_url,
             'invited_at', c.invited_at,
             'client_first_name', c.first_name)
         end
    into card
    from public.clients c
    join public.profiles p on p.id = c.trainer_id
   where c.id = found_id;
  return card;
end;
$$;

revoke execute on function public.invite_by_code(text) from public, anon;
grant execute on function public.invite_by_code(text) to authenticated;

-- Accepts the invite a code opens: links the signed-in person to that client row (the round 1
-- triggers keep the lock and tell both sides), and the code stops working. Returns the client
-- row, or null when the code doesn't open an invite or the person is already linked to that
-- trainer (no error after the lookup, as for invite_by_code()).
create function public.accept_invite_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_id uuid := public.invite_code_client(p_code);
  linked uuid;
begin
  if found_id is null then
    return null;
  end if;
  update public.clients c
     set user_id = me, invite_status = 'joined', invite_answered_at = now(), invite_code = null
   where c.id = found_id
     and c.user_id is null
     and not exists (
       select 1 from public.clients l where l.trainer_id = c.trainer_id and l.user_id = me and l.status <> 'archived'
     )
  returning c.id into linked;
  return linked;
end;
$$;

revoke execute on function public.accept_invite_code(text) from public, anon;
grant execute on function public.accept_invite_code(text) to authenticated;

-- A linked row has no use for a code, however it was linked (a code, or an email invite through
-- accept_trainer_invite()), so the code goes the moment someone is linked. If they leave later,
-- the trainer's next invite makes a new one.
create function public.clients_clear_invite_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is not null then
    new.invite_code := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.clients_clear_invite_code() from public, anon, authenticated;

create trigger clients_clear_invite_code before update of user_id on public.clients
  for each row when (new.user_id is not null) execute function public.clients_clear_invite_code();

-- The Voltrix app status of a client, for Voltrix Coach. 'gone' now means only that the person
-- who was linked deleted their Voltrix account (the trainer adds them as a new client). A row
-- someone left or declined says so; a waiting row locked to someone is 'invited' while that
-- person can still reach it (their email is on the row, or a code works), else 'not_on_app'.
create or replace function public.app_status(p_client public.clients)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when c.user_id is not null then 'joined'
           when c.last_user_id is not null and not exists (
             select 1 from auth.users u where u.id = c.last_user_id and u.email_confirmed_at is not null
           ) then 'gone'
           when c.invite_status in ('declined', 'left') then c.invite_status
           when c.last_user_id is not null then
             case when (c.invite_code is not null and c.invite_code_at > now() - interval '30 days')
                    or exists (
                      select 1 from auth.users u
                       where u.id = c.last_user_id and c.email is not null and lower(u.email) = lower(c.email)
                    )
                  then 'invited' else 'not_on_app' end
           when c.email is not null and exists (
             select 1 from auth.users u
              where lower(u.email) = lower(c.email) and u.email_confirmed_at is not null
           ) then 'invited'
           else 'not_on_app'
         end
    from public.clients c
   where c.id = p_client.id
     and c.trainer_id = auth.uid();
$$;

-- ---------- 3. Programs, templates and per-client copies ----------

-- Ready-made Voltrix templates every trainer can start from (filled in at the end). A template
-- names its exercises from the built-in library; using it makes the trainer's own copy.
create table public.voltrix_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  kind text not null check (kind in ('program', 'workout')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  summary text not null check (char_length(summary) between 1 and 300),
  level text not null check (level in ('beginner', 'intermediate', 'advanced')),
  equipment text not null check (equipment in ('gym', 'home')),
  weeks smallint not null check (weeks between 1 and 52),
  days_per_week smallint not null check (days_per_week between 1 and 7),
  minutes smallint not null check (minutes between 10 and 180),
  position int not null default 0,
  -- {"workouts": [{"key", "name", "notes", "exercises": [{"name", "sets", "reps", "rest", "notes"}]}],
  --  "schedule": [{"workout": key, "weekdays": [1-7], "from": week, "to": week, "note"}]}
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger voltrix_templates_set_updated_at before update on public.voltrix_templates
  for each row execute function public.set_updated_at();

alter table public.voltrix_templates enable row level security;
revoke all on public.voltrix_templates from anon, authenticated;
grant select on public.voltrix_templates to authenticated;

create policy voltrix_templates_select on public.voltrix_templates
  for select to authenticated using ((select public.is_trainer()));

-- A multi-week program: its workouts are the trainer's workouts with program_id set (the
-- program's own copies), and its schedule is program_slots. Giving it to a client copies it.
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  weeks smallint not null default 4 check (weeks between 1 and 52),
  -- The Voltrix template it was made from, if any.
  template_id uuid references public.voltrix_templates (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index programs_trainer_idx on public.programs (trainer_id);
create index programs_template_idx on public.programs (template_id) where template_id is not null;

create trigger programs_set_updated_at before update on public.programs
  for each row execute function public.set_updated_at();

-- A program given to a client: the plan workouts it made run from starts_on (a Monday) for its
-- weeks, or until ends_on when the trainer ends it early.
create table public.plan_assignments (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The program it was copied from; it stays when that program is removed.
  program_id uuid references public.programs (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  weeks smallint not null check (weeks between 1 and 52),
  starts_on date not null constraint plan_assignments_monday_check check (extract(isodow from starts_on) = 1),
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_assignments_ends_check check (ends_on between starts_on and starts_on + weeks * 7 - 1)
);

create index plan_assignments_client_idx on public.plan_assignments (client_id, starts_on);
create index plan_assignments_trainer_idx on public.plan_assignments (trainer_id);
create index plan_assignments_program_idx on public.plan_assignments (program_id) where program_id is not null;

create trigger plan_assignments_set_updated_at before update on public.plan_assignments
  for each row execute function public.set_updated_at();

-- Where a workout lives: the trainer's library (none set), one client's plan (client_id; with
-- assignment_id when it came with a program), or one of the trainer's programs (program_id).
-- Removing the client, the program or the assignment removes its workouts.
alter table public.workouts
  add column client_id uuid references public.clients (id) on delete cascade,
  add column program_id uuid references public.programs (id) on delete cascade,
  add column assignment_id uuid references public.plan_assignments (id) on delete cascade,
  add constraint workouts_home_check check (
    num_nonnulls(client_id, program_id) <= 1 and (assignment_id is null or client_id is not null)
  );

create index workouts_client_idx on public.workouts (client_id) where client_id is not null;
create index workouts_program_idx on public.workouts (program_id) where program_id is not null;
create index workouts_assignment_idx on public.workouts (assignment_id) where assignment_id is not null;

grant insert (client_id, program_id) on public.workouts to authenticated;

-- One workout in a program's schedule: on these weekdays (empty: any day, once a week) from
-- week_from to week_to (null: to the program's last week).
create table public.program_slots (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  week_from smallint not null default 1 check (week_from between 1 and 52),
  week_to smallint check (week_to is null or week_to between week_from and 52),
  weekdays smallint[] not null default '{}'
    check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(weekdays) <= 7),
  position int not null default 0 check (position >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index program_slots_program_idx on public.program_slots (program_id, position);
create index program_slots_workout_idx on public.program_slots (workout_id);
create index program_slots_trainer_idx on public.program_slots (trainer_id);

create trigger program_slots_set_updated_at before update on public.program_slots
  for each row execute function public.set_updated_at();

-- Plan workouts can start and end on a date (the client's own dates). Old rows and workouts
-- added on their own have neither, so they run every week, as before. assignment_id: the
-- program it came with (its end date applies too).
alter table public.plan_items
  add column starts_on date,
  add column ends_on date,
  add column assignment_id uuid references public.plan_assignments (id) on delete cascade,
  add constraint plan_items_dates_check check (starts_on is null or ends_on is null or ends_on >= starts_on);

create index plan_items_assignment_idx on public.plan_items (assignment_id) where assignment_id is not null;

-- Is this program the signed-in trainer's? True for none, like owns_client().
create function public.owns_program(p_program uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_program is null or exists (select 1 from public.programs where id = p_program and trainer_id = auth.uid());
$$;

revoke execute on function public.owns_program(uuid) from public, anon;
grant execute on function public.owns_program(uuid) to authenticated;

-- Is this workout one of the program's own workouts (the signed-in trainer's)?
create function public.program_has_workout(p_program uuid, p_workout uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workouts w
     where w.id = p_workout and w.program_id = p_program and w.trainer_id = auth.uid()
  );
$$;

revoke execute on function public.program_has_workout(uuid, uuid) from public, anon;
grant execute on function public.program_has_workout(uuid, uuid) to authenticated;

-- Can this workout go on this client's plan? One of the trainer's library workouts (as app
-- versions already on phones add them) or that client's own copy; never a program's workout or
-- another client's copy.
create function public.plan_workout_fits(p_workout uuid, p_client uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.workouts w
     where w.id = p_workout
       and w.trainer_id = auth.uid()
       and w.program_id is null
       and (w.client_id is null or w.client_id = p_client)
  );
$$;

revoke execute on function public.plan_workout_fits(uuid, uuid) from public, anon;
grant execute on function public.plan_workout_fits(uuid, uuid) to authenticated;

-- Does a plan workout run on any day from p_from to p_to? From its first day (none: always) to
-- its last (none: no end; callers pass the earlier of its own end and its program's end).
create function public.plan_item_runs(p_starts date, p_ends date, p_from date, p_to date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_starts, '-infinity'::date) <= p_to
     and coalesce(p_ends, 'infinity'::date) >= p_from
     and coalesce(p_starts, '-infinity'::date) <= coalesce(p_ends, 'infinity'::date);
$$;

revoke execute on function public.plan_item_runs(date, date, date, date) from public, anon, authenticated;

-- Does this plan workout run on this day, by its dates and its program's end? True for a plan
-- workout that doesn't exist (the foreign key answers for it). Says nothing about whose it is.
create function public.plan_item_runs_on(p_item uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.plan_item_runs(pi.starts_on, least(pi.ends_on, a.ends_on), p_day, p_day)
      from public.plan_items pi
      left join public.plan_assignments a on a.id = pi.assignment_id
     where pi.id = p_item
  ), true);
$$;

revoke execute on function public.plan_item_runs_on(uuid, date) from public, anon;
grant execute on function public.plan_item_runs_on(uuid, date) to authenticated;

-- New workouts can go straight into one of the trainer's programs or onto one client's plan.
alter policy workouts_insert_own on public.workouts
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.has_coach_access())
    and (select public.owns_client(client_id))
    and (select public.owns_program(program_id))
  );

-- A client's plan takes library workouts and that client's own copies only.
alter policy plan_items_insert_own on public.plan_items
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.owns_client(client_id))
    and (select public.owns_workout(workout_id))
    and (select public.plan_workout_fits(workout_id, client_id))
    and (select public.has_coach_access())
  );

alter table public.programs enable row level security;
alter table public.program_slots enable row level security;
alter table public.plan_assignments enable row level security;

revoke all on public.programs, public.program_slots, public.plan_assignments from anon, authenticated;

grant select, delete on public.programs to authenticated;
grant insert (name, description, weeks), update (name, description, weeks) on public.programs to authenticated;

grant select, delete on public.program_slots to authenticated;
grant insert (program_id, workout_id, week_from, week_to, weekdays, position, note),
  update (week_from, week_to, weekdays, position, note) on public.program_slots to authenticated;

-- Made only by assign_program(). The trainer can rename one, end it early, or take it off.
grant select, delete on public.plan_assignments to authenticated;
grant update (name, ends_on) on public.plan_assignments to authenticated;

create policy programs_select_own on public.programs
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy programs_insert_own on public.programs
  for insert to authenticated
  with check (trainer_id = (select auth.uid()) and (select public.is_trainer()) and (select public.has_coach_access()));
create policy programs_update_own on public.programs
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));
create policy programs_delete_own on public.programs
  for delete to authenticated using (trainer_id = (select auth.uid()));

create policy program_slots_select_own on public.program_slots
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy program_slots_insert_own on public.program_slots
  for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and (select public.has_coach_access())
    and (select public.program_has_workout(program_id, workout_id))
  );
create policy program_slots_update_own on public.program_slots
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));
create policy program_slots_delete_own on public.program_slots
  for delete to authenticated using (trainer_id = (select auth.uid()));

create policy plan_assignments_select_own on public.plan_assignments
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy plan_assignments_update_own on public.plan_assignments
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));
create policy plan_assignments_delete_own on public.plan_assignments
  for delete to authenticated using (trainer_id = (select auth.uid()));

-- The signed-in trainer, when they may add things (a trial, plan or free access), as the insert
-- rules on workouts and plans ask. Only the functions below call it.
create function public.coach_adding()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public.has_coach_access() then
    raise exception 'Your Voltrix Coach plan isn''t active.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

revoke execute on function public.coach_adding() from public, anon, authenticated;

-- Copies one of the trainer's workouts with its exercises (and their videos, which stay where
-- they are) into a new home: the library, a client's plan or a program. Returns the copy.
create function public.copy_workout_into(p_workout uuid, p_name text, p_client uuid, p_program uuid, p_assignment uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  copied uuid;
begin
  insert into public.workouts (trainer_id, name, notes, video_path, client_id, program_id, assignment_id)
  select w.trainer_id, coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), w.name), w.notes, w.video_path,
         p_client, p_program, p_assignment
    from public.workouts w
   where w.id = p_workout
  returning id into copied;
  if copied is not null then
    insert into public.workout_exercises
      (workout_id, exercise_id, position, sets, reps, weight, weight_unit, rest_seconds, notes, video_path)
    select copied, we.exercise_id, we.position, we.sets, we.reps, we.weight, we.weight_unit, we.rest_seconds, we.notes,
           we.video_path
      from public.workout_exercises we
     where we.workout_id = p_workout;
  end if;
  return copied;
end;
$$;

revoke execute on function public.copy_workout_into(uuid, text, uuid, uuid, uuid) from public, anon, authenticated;

-- "Save to your workouts" and "Duplicate": copies one of the signed-in trainer's workouts (from
-- the library, a client's plan or a program) into their library, or into one of their programs
-- with p_program. Returns the new workout.
create function public.copy_workout(p_workout uuid, p_name text default null, p_program uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
begin
  if not exists (select 1 from public.workouts w where w.id = p_workout and w.trainer_id = me) then
    raise exception 'That workout is no longer available.' using errcode = '22023';
  end if;
  if p_program is not null and not exists (select 1 from public.programs p where p.id = p_program and p.trainer_id = me) then
    raise exception 'That program is no longer available.' using errcode = '22023';
  end if;
  if (select count(*) from public.workout_exercises we where we.workout_id = p_workout) > 100 then
    raise exception 'That workout is too long to copy.' using errcode = '22023';
  end if;
  return public.copy_workout_into(p_workout, p_name, null, p_program, null);
end;
$$;

revoke execute on function public.copy_workout(uuid, text, uuid) from public, anon;
grant execute on function public.copy_workout(uuid, text, uuid) to authenticated;

-- Puts a workout on a client's plan as the client's own copy, on these weekdays (empty: any day,
-- once a week), with a note for them, at the end of their plan. A workout that already is this
-- client's own copy (not from a program) goes on as it is. Returns the plan workout.
create function public.assign_workout(p_workout uuid, p_client uuid, p_weekdays smallint[] default '{}', p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
  src public.workouts;
  target uuid;
  item uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('plan:' || p_client::text, 0));
  select * into src from public.workouts w where w.id = p_workout and w.trainer_id = me;
  if src.id is null then
    raise exception 'That workout is no longer available.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client and c.trainer_id = me and c.status <> 'archived') then
    raise exception 'This client can''t get a plan now.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_weekdays, '{}')) d where d is null or d not between 1 and 7) then
    raise exception 'Pick days from Monday to Sunday.' using errcode = '22023';
  end if;
  if (select count(*) from public.workout_exercises we where we.workout_id = p_workout) > 100 then
    raise exception 'That workout is too long to copy.' using errcode = '22023';
  end if;
  if src.client_id = p_client and src.assignment_id is null then
    target := src.id;
  else
    target := public.copy_workout_into(src.id, null, p_client, null, null);
  end if;
  insert into public.plan_items (trainer_id, client_id, workout_id, position, weekdays, note)
  values (
    me, p_client, target,
    coalesce((select max(pi.position) + 1 from public.plan_items pi where pi.client_id = p_client and pi.trainer_id = me), 0),
    coalesce((select array_agg(distinct d order by d) from unnest(p_weekdays) d), '{}'),
    nullif(left(btrim(coalesce(p_note, '')), 500), '')
  )
  returning id into item;
  return item;
end;
$$;

revoke execute on function public.assign_workout(uuid, uuid, smallint[], text) from public, anon;
grant execute on function public.assign_workout(uuid, uuid, smallint[], text) to authenticated;

-- Gives one of the trainer's programs to a client from a Monday: the program's workouts are
-- copied as the client's own, and each slot becomes a plan workout dated to its weeks. With
-- p_end_current, what is on the client's plan from this trainer and still running then
-- (programs and workouts added on their own) ends the day before, or yesterday when the program
-- starts earlier this week; nothing is removed, so ticks and history stay. Returns the
-- assignment.
create function public.assign_program(p_program uuid, p_client uuid, p_starts_on date, p_end_current boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
  today date := (now() at time zone 'utc')::date;
  prog public.programs;
  assignment uuid;
  part record;
  copies jsonb := '{}';
  base int;
  -- The last day of what is being replaced: the day before the start, or yesterday for a
  -- program that starts earlier this week, so days already done keep their workouts and ticks.
  cut date := greatest(p_starts_on - 1, today - 1);
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('plan:' || p_client::text, 0));
  select * into prog from public.programs p where p.id = p_program and p.trainer_id = me;
  if prog.id is null then
    raise exception 'That program is no longer available.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client and c.trainer_id = me and c.status <> 'archived') then
    raise exception 'This client can''t get a plan now.' using errcode = '22023';
  end if;
  if p_starts_on is null or extract(isodow from p_starts_on) <> 1 then
    raise exception 'Start a program on a Monday.' using errcode = '22023';
  end if;
  -- From this week's Monday (a day either side for time zones) to a year ahead.
  if p_starts_on not between today - 8 and today + 371 then
    raise exception 'Pick a Monday from this week to a year ahead.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.program_slots s where s.program_id = p_program and s.week_from <= prog.weeks) then
    raise exception 'Add a workout to the program''s weeks first.' using errcode = '22023';
  end if;
  if (select count(*) from public.workouts w where w.program_id = p_program) > 30
     or (select count(*) from public.program_slots s where s.program_id = p_program) > 60
     or (select count(*) from public.workout_exercises we join public.workouts w on w.id = we.workout_id
          where w.program_id = p_program) > 1500 then
    raise exception 'That program is too big to give to a client. Split it into two programs.' using errcode = '22023';
  end if;

  if p_end_current then
    update public.plan_assignments a
       set ends_on = cut
     where a.client_id = p_client
       and a.trainer_id = me
       and a.starts_on < p_starts_on
       and a.ends_on > cut;
    update public.plan_items pi
       set ends_on = cut
     where pi.client_id = p_client
       and pi.trainer_id = me
       and pi.assignment_id is null
       and coalesce(pi.starts_on, '-infinity'::date) < p_starts_on
       and coalesce(pi.ends_on, 'infinity'::date) > cut;
  end if;

  insert into public.plan_assignments (trainer_id, client_id, program_id, name, weeks, starts_on, ends_on)
  values (me, p_client, prog.id, prog.name, prog.weeks, p_starts_on, p_starts_on + prog.weeks * 7 - 1)
  returning id into assignment;

  for part in
    select w.id from public.workouts w
     where w.program_id = p_program
       and exists (select 1 from public.program_slots s where s.workout_id = w.id and s.week_from <= prog.weeks)
     order by w.created_at, w.id
  loop
    copies := copies || jsonb_build_object(part.id::text, public.copy_workout_into(part.id, null, p_client, null, assignment));
  end loop;

  base := coalesce((select max(pi.position) + 1 from public.plan_items pi where pi.client_id = p_client and pi.trainer_id = me), 0);
  insert into public.plan_items (trainer_id, client_id, workout_id, position, weekdays, note, starts_on, ends_on, assignment_id)
  select me, p_client, (copies ->> s.workout_id::text)::uuid,
         base + (row_number() over (order by s.week_from, s.position, s.created_at, s.id))::int - 1,
         s.weekdays, s.note,
         p_starts_on + (s.week_from - 1) * 7,
         p_starts_on + least(coalesce(s.week_to, prog.weeks), prog.weeks) * 7 - 1,
         assignment
    from public.program_slots s
   where s.program_id = p_program
     and s.week_from <= prog.weeks;

  return assignment;
end;
$$;

revoke execute on function public.assign_program(uuid, uuid, date, boolean) from public, anon;
grant execute on function public.assign_program(uuid, uuid, date, boolean) to authenticated;

-- "Save as template" for a client's program: copies the program as it is on the client's plan
-- now (with the changes made for them, all its weeks) into a new program. Returns it.
create function public.save_assignment_as_program(p_assignment uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
  asg public.plan_assignments;
  prog uuid;
  part record;
  copies jsonb := '{}';
begin
  select * into asg from public.plan_assignments a where a.id = p_assignment and a.trainer_id = me;
  if asg.id is null then
    raise exception 'That program is no longer on this client''s plan.' using errcode = '22023';
  end if;
  if (select count(*) from public.programs p where p.trainer_id = me) >= 200 then
    raise exception 'You have 200 programs. Remove some you no longer use first.' using errcode = '22023';
  end if;
  if (select count(*) from public.workouts w where w.assignment_id = p_assignment) > 30
     or (select count(*) from public.workout_exercises we join public.workouts w on w.id = we.workout_id
          where w.assignment_id = p_assignment) > 1500 then
    raise exception 'That program is too big to copy.' using errcode = '22023';
  end if;
  insert into public.programs (trainer_id, name, weeks)
  values (me, coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), asg.name), asg.weeks)
  returning id into prog;
  for part in
    select w.id from public.workouts w where w.assignment_id = p_assignment order by w.created_at, w.id
  loop
    copies := copies || jsonb_build_object(part.id::text, public.copy_workout_into(part.id, null, null, prog, null));
  end loop;
  insert into public.program_slots (trainer_id, program_id, workout_id, week_from, week_to, weekdays, position, note)
  select me, prog, (copies ->> pi.workout_id::text)::uuid,
         ((pi.starts_on - asg.starts_on) / 7 + 1)::smallint,
         ((pi.ends_on - asg.starts_on + 1) / 7)::smallint,
         pi.weekdays,
         (row_number() over (order by pi.position, pi.created_at, pi.id))::int - 1,
         pi.note
    from public.plan_items pi
   where pi.assignment_id = p_assignment
     and copies ? pi.workout_id::text;
  return prog;
end;
$$;

revoke execute on function public.save_assignment_as_program(uuid, text) from public, anon;
grant execute on function public.save_assignment_as_program(uuid, text) to authenticated;

-- "Duplicate" for a program: copies one of the trainer's programs with its workouts and weeks
-- into a new program. Returns it.
create function public.copy_program(p_program uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
  src public.programs;
  prog uuid;
  part record;
  copies jsonb := '{}';
begin
  select * into src from public.programs p where p.id = p_program and p.trainer_id = me;
  if src.id is null then
    raise exception 'That program is no longer available.' using errcode = '22023';
  end if;
  if (select count(*) from public.programs p where p.trainer_id = me) >= 200 then
    raise exception 'You have 200 programs. Remove some you no longer use first.' using errcode = '22023';
  end if;
  if (select count(*) from public.workouts w where w.program_id = p_program) > 30
     or (select count(*) from public.workout_exercises we join public.workouts w on w.id = we.workout_id
          where w.program_id = p_program) > 1500 then
    raise exception 'That program is too big to copy.' using errcode = '22023';
  end if;
  insert into public.programs (trainer_id, name, description, weeks, template_id)
  values (me, coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), left(src.name || ' (copy)', 120)),
          src.description, src.weeks, src.template_id)
  returning id into prog;
  for part in
    select w.id from public.workouts w where w.program_id = p_program order by w.created_at, w.id
  loop
    copies := copies || jsonb_build_object(part.id::text, public.copy_workout_into(part.id, null, null, prog, null));
  end loop;
  insert into public.program_slots (trainer_id, program_id, workout_id, week_from, week_to, weekdays, position, note)
  select me, prog, (copies ->> s.workout_id::text)::uuid, s.week_from, s.week_to, s.weekdays, s.position, s.note
    from public.program_slots s
   where s.program_id = p_program;
  return prog;
end;
$$;

revoke execute on function public.copy_program(uuid, text) from public, anon;
grant execute on function public.copy_program(uuid, text) to authenticated;

-- "Use this template": copies a Voltrix template into the signed-in trainer's own rows. A program
-- template becomes a new program with its own workouts and weeks (named p_name if given); a
-- workout template becomes a library workout, or a workout in one of their programs with
-- p_program. Exercises come from the built-in library by name. Returns the new program or
-- workout.
create function public.use_voltrix_template(p_template uuid, p_name text default null, p_program uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
  t public.voltrix_templates;
  w jsonb;
  made uuid;
  first_made uuid;
  keys jsonb := '{}';
  prog uuid;
begin
  select * into t from public.voltrix_templates vt where vt.id = p_template;
  if t.id is null then
    raise exception 'That template is no longer available.' using errcode = '22023';
  end if;
  if t.kind = 'program' then
    if (select count(*) from public.programs p where p.trainer_id = me) >= 200 then
      raise exception 'You have 200 programs. Remove some you no longer use first.' using errcode = '22023';
    end if;
    insert into public.programs (trainer_id, name, description, weeks, template_id)
    values (me, coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), t.name), t.summary, t.weeks, t.id)
    returning id into prog;
  elsif p_program is not null then
    if not exists (select 1 from public.programs p where p.id = p_program and p.trainer_id = me) then
      raise exception 'That program is no longer available.' using errcode = '22023';
    end if;
    prog := p_program;
  end if;
  for w in select x.value from jsonb_array_elements(t.body -> 'workouts') x loop
    insert into public.workouts (trainer_id, name, notes, program_id)
    values (me,
            case when t.kind = 'workout' then coalesce(nullif(left(btrim(coalesce(p_name, '')), 120), ''), left(w ->> 'name', 120))
                 else left(w ->> 'name', 120) end,
            nullif(left(coalesce(w ->> 'notes', ''), 2000), ''),
            prog)
    returning id into made;
    first_made := coalesce(first_made, made);
    insert into public.workout_exercises (workout_id, exercise_id, position, sets, reps, rest_seconds, notes)
    select made, e.id, (row_number() over (order by x.i))::int - 1,
           least(greatest(coalesce((x.ex ->> 'sets')::int, 3), 1), 20),
           left(coalesce(x.ex ->> 'reps', '10'), 30),
           least(greatest((x.ex ->> 'rest')::int, 0), 900),
           nullif(left(coalesce(x.ex ->> 'notes', ''), 500), '')
      from jsonb_array_elements(w -> 'exercises') with ordinality as x(ex, i)
      join public.exercises e on e.trainer_id is null and lower(e.name) = lower(x.ex ->> 'name');
    keys := keys || jsonb_build_object(w ->> 'key', made);
  end loop;
  if t.kind = 'workout' then
    return first_made;
  end if;
  insert into public.program_slots (trainer_id, program_id, workout_id, week_from, week_to, weekdays, position, note)
  select me, prog, (keys ->> (s.line ->> 'workout'))::uuid,
         coalesce((s.line ->> 'from')::smallint, 1),
         (s.line ->> 'to')::smallint,
         coalesce(array(select jsonb_array_elements_text(s.line -> 'weekdays')::smallint), '{}'),
         s.i::int - 1,
         s.line ->> 'note'
    from jsonb_array_elements(t.body -> 'schedule') with ordinality as s(line, i);
  return prog;
end;
$$;

revoke execute on function public.use_voltrix_template(uuid, text, uuid) from public, anon;
grant execute on function public.use_voltrix_template(uuid, text, uuid) to authenticated;

-- Which of these video files (at most 100) one of the signed-in trainer's workouts, workout
-- exercises or own exercises still uses. Copies share video files, so the app removes a file
-- from storage only when nothing uses it any more.
create function public.workout_videos_in_use(p_paths text[])
returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.path), '{}')
    from unnest(p_paths[1:100]) as x(path)
   where auth.uid() is not null
     and (
       exists (select 1 from public.workouts w where w.trainer_id = auth.uid() and w.video_path = x.path)
       or exists (
         select 1 from public.workout_exercises we
           join public.workouts w on w.id = we.workout_id
          where w.trainer_id = auth.uid() and we.video_path = x.path
       )
       or exists (select 1 from public.exercises e where e.trainer_id = auth.uid() and e.video_path = x.path)
     );
$$;

revoke execute on function public.workout_videos_in_use(text[]) from public, anon;
grant execute on function public.workout_videos_in_use(text[]) to authenticated;

-- ---------- 4. The client's plan (Voltrix) ----------

-- As before (the same 16 columns, for app versions already on phones), but only the plan
-- workouts that run on some day from p_from to p_to.
create or replace function public.my_plan(p_from date, p_to date)
returns table (
  plan_item_id uuid,
  chat_id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  trainer_avatar text,
  workout_id uuid,
  workout_name text,
  workout_notes text,
  workout_video_path text,
  weekdays smallint[],
  note text,
  "position" int,
  exercise_count int,
  done_on date[],
  trainer_units text
)
language sql
stable
security definer
set search_path = ''
as $$
  select pi.id, c.id, pi.trainer_id, p.full_name, p.business_name, p.avatar_url,
         w.id, w.name, w.notes, w.video_path,
         pi.weekdays, pi.note, pi.position,
         (select count(*)::int from public.workout_exercises we where we.workout_id = w.id),
         coalesce((select array_agg(d.done_on order by d.done_on)
                     from public.plan_completions d
                    where d.plan_item_id = pi.id and d.user_id = auth.uid()
                      and d.done_on between p_from and p_to), '{}'),
         case when p.preferences->>'units' = 'lb' then 'lb' else 'kg' end
    from public.plan_items pi
    join public.clients c on c.id = pi.client_id
    join public.workouts w on w.id = pi.workout_id
    join public.profiles p on p.id = pi.trainer_id
    left join public.plan_assignments a on a.id = pi.assignment_id
   where auth.uid() is not null
     and c.user_id = auth.uid()
     and c.status <> 'archived'
     and c.trainer_id = pi.trainer_id
     and w.trainer_id = pi.trainer_id
     and p_to - p_from between 0 and 62
     and public.plan_item_runs(pi.starts_on, least(pi.ends_on, a.ends_on), p_from, p_to)
   order by c.created_at, pi.position, pi.created_at;
$$;

-- my_plan() plus each plan workout's first and last day (its own, or its program's end when
-- that is earlier), and the program it came with: its name, first Monday, length in weeks and
-- last day (all null for a workout added on its own).
create function public.my_plan_v2(p_from date, p_to date)
returns table (
  plan_item_id uuid,
  chat_id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  trainer_avatar text,
  workout_id uuid,
  workout_name text,
  workout_notes text,
  workout_video_path text,
  weekdays smallint[],
  note text,
  "position" int,
  exercise_count int,
  done_on date[],
  trainer_units text,
  starts_on date,
  ends_on date,
  assignment_id uuid,
  program_name text,
  program_starts_on date,
  program_weeks int,
  program_ends_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select pi.id, c.id, pi.trainer_id, p.full_name, p.business_name, p.avatar_url,
         w.id, w.name, w.notes, w.video_path,
         pi.weekdays, pi.note, pi.position,
         (select count(*)::int from public.workout_exercises we where we.workout_id = w.id),
         coalesce((select array_agg(d.done_on order by d.done_on)
                     from public.plan_completions d
                    where d.plan_item_id = pi.id and d.user_id = auth.uid()
                      and d.done_on between p_from and p_to), '{}'),
         case when p.preferences->>'units' = 'lb' then 'lb' else 'kg' end,
         pi.starts_on, least(pi.ends_on, a.ends_on),
         a.id, a.name, a.starts_on, a.weeks::int, a.ends_on
    from public.plan_items pi
    join public.clients c on c.id = pi.client_id
    join public.workouts w on w.id = pi.workout_id
    join public.profiles p on p.id = pi.trainer_id
    left join public.plan_assignments a on a.id = pi.assignment_id
   where auth.uid() is not null
     and c.user_id = auth.uid()
     and c.status <> 'archived'
     and c.trainer_id = pi.trainer_id
     and w.trainer_id = pi.trainer_id
     and p_to - p_from between 0 and 62
     and public.plan_item_runs(pi.starts_on, least(pi.ends_on, a.ends_on), p_from, p_to)
   order by c.created_at, a.starts_on nulls first, pi.position, pi.created_at;
$$;

revoke execute on function public.my_plan_v2(date, date) from public, anon;
grant execute on function public.my_plan_v2(date, date) to authenticated;

-- A tick only lands on a day its plan workout runs. Ticked in the app (the person's own insert,
-- checked by the round 1 policy too), a wrong day is refused with a sentence; written by a
-- function such as finish_workout() after a live workout, it is left out quietly so the
-- workout itself is still saved.
create function public.plan_completions_on_plan_day()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.plan_item_runs_on(new.plan_item_id, new.done_on) then
    return new;
  end if;
  if current_user in ('authenticated', 'anon') then
    raise exception 'This workout isn''t on your plan that day.' using errcode = '22023';
  end if;
  return null;
end;
$$;

revoke execute on function public.plan_completions_on_plan_day() from public, anon, authenticated;

create trigger plan_completions_on_plan_day before insert on public.plan_completions
  for each row execute function public.plan_completions_on_plan_day();

-- ---------- 5. Who needs you today ----------

-- One row per client of the signed-in trainer (not archived), or just p_client (archived too).
-- p_today is the trainer's own date; more than a day away from UTC's counts as UTC's (a phone
-- with the wrong date). The week is Monday to Sunday around it. What the client logs (workouts,
-- ticks, check-ins) is filled in only while coached_user() allows it, like every round 1 read;
-- otherwise those columns are null (or 0). Check-ins waiting for this trainer's reply are the
-- ones saved or changed in the last 14 days, so an old pile doesn't nag forever.
--   linked, joined_at        linked now (and when they accepted)
--   account_name             the name on the linked person's Voltrix account, so the trainer can
--                            see that the right person accepted (an invite code can be forwarded)
--   sessions_done, no_shows, no_shows_30d   this trainer's sessions with them
--   open_sessions            sessions from the last 30 days that have ended and are still booked
--   last_session_at          the newest session marked done; next_session_at the next booked one
--   last_workout_on/_name    their newest saved workout
--   last_tick_on             the newest day they ticked off one of this trainer's plan workouts
--   plan_planned_week        this trainer's plan workouts due this week (any-day ones count once)
--   plan_done_week           how many of those are ticked (linked only)
--   program_*                the program running this week, else the next one to start
--   last_check_in_week       the Monday of their newest weekly check-in
create function public.clients_overview(p_today date, p_client uuid default null)
returns table (
  client_id uuid,
  first_name text,
  last_name text,
  status text,
  app_status text,
  email text,
  phone text,
  created_at timestamptz,
  invited_at timestamptz,
  invite_code_at timestamptz,
  invite_shared_at timestamptz,
  linked boolean,
  joined_at timestamptz,
  account_name text,
  session_price_cents integer,
  sessions_done integer,
  no_shows integer,
  no_shows_30d integer,
  open_sessions integer,
  last_session_at timestamptz,
  next_session_at timestamptz,
  last_workout_on date,
  last_workout_name text,
  last_tick_on date,
  plan_planned_week integer,
  plan_done_week integer,
  program_id uuid,
  program_name text,
  program_starts_on date,
  program_weeks integer,
  program_ends_on date,
  last_check_in_week date,
  unanswered_check_ins integer,
  unanswered_since timestamptz,
  unanswered_check_in_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select case
             when p_today between (now() at time zone 'utc')::date - 1 and (now() at time zone 'utc')::date + 1
               then p_today
             else (now() at time zone 'utc')::date
           end as today
  ), wk as (
    select d.today - (extract(isodow from d.today)::int - 1) as monday from d
  )
  select c.id, c.first_name, c.last_name, c.status, public.app_status(c), c.email, c.phone, c.created_at,
         c.invited_at, c.invite_code_at, c.invite_shared_at,
         u.person is not null,
         case when u.person is not null then c.invite_answered_at end,
         (select pr.full_name from public.profiles pr where pr.id = u.person),
         c.session_price_cents,
         s.done, s.no_shows, s.no_shows_30d, s.open, s.last_at, s.next_at,
         lw.day, lw.workout_name, t.last_tick,
         coalesce(pl.planned, 0),
         case when u.person is not null then coalesce(pl.done, 0) end,
         pg.id, pg.name, pg.starts_on, pg.weeks::int, pg.ends_on,
         k.last_week, coalesce(k.unanswered, 0), k.since, k.newest_id
    from public.clients c
   cross join wk
   cross join lateral (select public.coached_user(c.id) as person) u
   cross join lateral (
      select (count(*) filter (where x.status = 'completed'))::int as done,
             (count(*) filter (where x.status = 'no_show'))::int as no_shows,
             (count(*) filter (where x.status = 'no_show' and x.starts_at > now() - interval '30 days'))::int as no_shows_30d,
             (count(*) filter (where x.status = 'scheduled'
                                 and x.starts_at > now() - interval '30 days'
                                 and x.starts_at + make_interval(mins => x.duration_minutes) <= now()))::int as open,
             max(x.starts_at) filter (where x.status = 'completed') as last_at,
             min(x.starts_at) filter (where x.status = 'scheduled' and x.starts_at > now()) as next_at
        from public.sessions x
       where x.client_id = c.id
         and x.trainer_id = c.trainer_id
    ) s
    left join lateral (
      select l.day, l.workout_name
        from public.workout_logs l
       where l.user_id = u.person
       order by l.finished_at desc
       limit 1
    ) lw on true
    left join lateral (
      select max(pc.done_on) as last_tick
        from public.plan_completions pc
        join public.plan_items pi on pi.id = pc.plan_item_id
       where pi.client_id = c.id
         and pi.trainer_id = c.trainer_id
         and pc.user_id = u.person
    ) t on true
    left join lateral (
      select sum(due.n)::int as planned,
             sum(least(due.n, (
               select count(*) from public.plan_completions pc
                where pc.plan_item_id = due.id
                  and pc.user_id = u.person
                  and pc.done_on between wk.monday and wk.monday + 6
             )))::int as done
        from (
          select pi.id,
                 case when cardinality(pi.weekdays) = 0 then 1
                      else (select count(*)::int from unnest(pi.weekdays) wd
                             where public.plan_item_runs(pi.starts_on, least(pi.ends_on, a.ends_on),
                                                         wk.monday + wd - 1, wk.monday + wd - 1)) end as n
            from public.plan_items pi
            left join public.plan_assignments a on a.id = pi.assignment_id
           where pi.client_id = c.id
             and pi.trainer_id = c.trainer_id
             and public.plan_item_runs(pi.starts_on, least(pi.ends_on, a.ends_on), wk.monday, wk.monday + 6)
        ) due
    ) pl on true
    left join lateral (
      select a.id, a.name, a.starts_on, a.weeks, a.ends_on
        from public.plan_assignments a
       where a.client_id = c.id
         and a.trainer_id = c.trainer_id
         and a.ends_on >= wk.monday
       order by a.starts_on, a.created_at
       limit 1
    ) pg on true
    left join lateral (
      select max(ci.week_start) as last_week,
             (count(*) filter (where ci.updated_at > now() - interval '14 days' and r.id is null))::int as unanswered,
             min(ci.updated_at) filter (where ci.updated_at > now() - interval '14 days' and r.id is null) as since,
             (array_agg(ci.id order by ci.week_start desc)
                filter (where ci.updated_at > now() - interval '14 days' and r.id is null))[1] as newest_id
        from public.check_ins ci
        left join public.check_in_replies r on r.check_in_id = ci.id and r.trainer_id = c.trainer_id
       where ci.user_id = u.person
    ) k on true
   where auth.uid() is not null
     and c.trainer_id = auth.uid()
     and (case when p_client is null then c.status <> 'archived' else c.id = p_client end)
   order by lower(c.first_name), lower(coalesce(c.last_name, '')), c.id;
$$;

revoke execute on function public.clients_overview(date, uuid) from public, anon;
grant execute on function public.clients_overview(date, uuid) to authenticated;

-- ---------- 6. Live news for clients ----------

-- Tells each linked client ('session' on their inbox, with their client row) that one of their
-- bookings was added, moved, marked or removed, so an open Voltrix app shows it. Price changes
-- alone send nothing (clients don't see prices). Best effort, like messages.
create function public.sessions_news()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  link record;
begin
  if tg_op = 'INSERT' then
    select array_agg(distinct n.client_id) into ids from new_rows n;
  elsif tg_op = 'DELETE' then
    select array_agg(distinct o.client_id) into ids from old_rows o;
  else
    select array_agg(distinct x.id) into ids
      from new_rows n
      join old_rows o on o.id = n.id
      cross join lateral unnest(array[n.client_id, o.client_id]) as x(id)
     where (n.client_id, n.starts_at, n.duration_minutes, n.location, n.status, n.online)
           is distinct from (o.client_id, o.starts_at, o.duration_minutes, o.location, o.status, o.online);
  end if;
  for link in
    select c.id, c.user_id from public.clients c
     where c.id = any(ids) and c.user_id is not null and c.status <> 'archived'
  loop
    perform public.send_to_inbox(link.user_id, 'session', jsonb_build_object('client_id', link.id));
  end loop;
  return null;
end;
$$;

revoke execute on function public.sessions_news() from public, anon, authenticated;

create trigger sessions_news_insert after insert on public.sessions
  referencing new table as new_rows for each statement execute function public.sessions_news();
create trigger sessions_news_update after update on public.sessions
  referencing old table as old_rows new table as new_rows for each statement execute function public.sessions_news();
create trigger sessions_news_delete after delete on public.sessions
  referencing old table as old_rows for each statement execute function public.sessions_news();

-- The same ('plan') when workouts are added to, changed on or taken off a client's plan, or a
-- program on it is renamed or ended. One message per client per change, however many rows.
create function public.plan_news()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  link record;
begin
  if tg_op = 'DELETE' then
    select array_agg(distinct o.client_id) into ids from old_rows o;
  else
    select array_agg(distinct n.client_id) into ids from new_rows n;
  end if;
  for link in
    select c.id, c.user_id from public.clients c
     where c.id = any(ids) and c.user_id is not null and c.status <> 'archived'
  loop
    perform public.send_to_inbox(link.user_id, 'plan', jsonb_build_object('client_id', link.id));
  end loop;
  return null;
end;
$$;

revoke execute on function public.plan_news() from public, anon, authenticated;

create trigger plan_items_news_insert after insert on public.plan_items
  referencing new table as new_rows for each statement execute function public.plan_news();
create trigger plan_items_news_update after update on public.plan_items
  referencing old table as old_rows new table as new_rows for each statement execute function public.plan_news();
create trigger plan_items_news_delete after delete on public.plan_items
  referencing old table as old_rows for each statement execute function public.plan_news();
create trigger plan_assignments_news_update after update on public.plan_assignments
  referencing old table as old_rows new table as new_rows for each statement execute function public.plan_news();

-- ---------- 7. The Voltrix templates ----------

-- Built from the 50 built-in exercises. Weights are left for the trainer to set per client. Rest
-- is in seconds. Weekdays are 1 = Monday to 7 = Sunday; an empty list is any day, once a week.
insert into public.voltrix_templates (slug, kind, name, summary, level, equipment, weeks, days_per_week, minutes, position, body)
values
('foundations', 'program', 'Foundations',
 'Three full-body sessions a week to learn the main lifts and build the habit. For new clients.',
 'beginner', 'gym', 4, 3, 45, 10, $j${
  "workouts": [
    {"key": "a", "name": "Foundations A", "notes": "Leave two or three reps in the tank on every set.", "exercises": [
      {"name": "Goblet Squat", "sets": 3, "reps": "10", "rest": 90, "notes": "Sit down between your heels, chest up."},
      {"name": "Chest Press Machine", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Lat Pulldown", "sets": 3, "reps": "10", "rest": 90, "notes": "Pull to the top of your chest."},
      {"name": "Glute Bridge", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Plank", "sets": 3, "reps": "30 s", "rest": 45}]},
    {"key": "b", "name": "Foundations B", "notes": "Leave two or three reps in the tank on every set.", "exercises": [
      {"name": "Leg Press", "sets": 3, "reps": "12", "rest": 90},
      {"name": "Seated Cable Row", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Seated Dumbbell Shoulder Press", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Lying Leg Curl", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Dead Bug", "sets": 3, "reps": "8 each side", "rest": 45}]},
    {"key": "c", "name": "Foundations C", "notes": "Leave two or three reps in the tank on every set.", "exercises": [
      {"name": "Romanian Deadlift", "sets": 3, "reps": "10", "rest": 90, "notes": "Light. Push your hips back and feel the hamstrings."},
      {"name": "Incline Dumbbell Press", "sets": 3, "reps": "10", "rest": 90},
      {"name": "One-Arm Dumbbell Row", "sets": 3, "reps": "10 each side", "rest": 60},
      {"name": "Walking Lunge", "sets": 2, "reps": "10 each leg", "rest": 60},
      {"name": "Side Plank", "sets": 2, "reps": "20 s each side", "rest": 45}]}],
  "schedule": [
    {"workout": "a", "weekdays": [1], "from": 1, "to": 4},
    {"workout": "b", "weekdays": [3], "from": 1, "to": 4},
    {"workout": "c", "weekdays": [5], "from": 1, "to": 4}]
}$j$::jsonb),
('strength-base', 'program', 'Strength Base',
 'Squat, bench, deadlift and press three days a week. Weeks 5 to 8 go heavier with fewer reps.',
 'intermediate', 'gym', 8, 3, 60, 20, $j${
  "workouts": [
    {"key": "a", "name": "Strength Base A", "exercises": [
      {"name": "Back Squat", "sets": 4, "reps": "8", "rest": 150},
      {"name": "Barbell Bench Press", "sets": 4, "reps": "8", "rest": 150},
      {"name": "Barbell Row", "sets": 3, "reps": "8", "rest": 120},
      {"name": "Face Pull", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Hanging Leg Raise", "sets": 3, "reps": "10", "rest": 60}]},
    {"key": "b", "name": "Strength Base B", "exercises": [
      {"name": "Deadlift", "sets": 3, "reps": "6", "rest": 180},
      {"name": "Overhead Press", "sets": 4, "reps": "8", "rest": 120},
      {"name": "Pull-Up", "sets": 3, "reps": "6–8", "rest": 120, "notes": "Use a band or the assisted machine if needed."},
      {"name": "Bulgarian Split Squat", "sets": 3, "reps": "8 each leg", "rest": 90},
      {"name": "Plank", "sets": 3, "reps": "45 s", "rest": 45}]},
    {"key": "c", "name": "Strength Base C", "exercises": [
      {"name": "Front Squat", "sets": 3, "reps": "8", "rest": 150},
      {"name": "Incline Dumbbell Press", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Seated Cable Row", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Hip Thrust", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Farmer's Carry", "sets": 3, "reps": "30 m", "rest": 60}]},
    {"key": "a2", "name": "Strength Base A, heavy", "notes": "Heavier than weeks 1 to 4. Keep every rep clean.", "exercises": [
      {"name": "Back Squat", "sets": 5, "reps": "5", "rest": 180},
      {"name": "Barbell Bench Press", "sets": 5, "reps": "5", "rest": 180},
      {"name": "Barbell Row", "sets": 4, "reps": "6", "rest": 120},
      {"name": "Face Pull", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Cable Crunch", "sets": 3, "reps": "12", "rest": 60}]},
    {"key": "b2", "name": "Strength Base B, heavy", "notes": "Heavier than weeks 1 to 4. Keep every rep clean.", "exercises": [
      {"name": "Deadlift", "sets": 4, "reps": "3–5", "rest": 180},
      {"name": "Overhead Press", "sets": 5, "reps": "5", "rest": 150},
      {"name": "Pull-Up", "sets": 4, "reps": "5–6", "rest": 120},
      {"name": "Bulgarian Split Squat", "sets": 3, "reps": "6 each leg", "rest": 90},
      {"name": "Side Plank", "sets": 3, "reps": "30 s each side", "rest": 45}]},
    {"key": "c2", "name": "Strength Base C, heavy", "notes": "Heavier than weeks 1 to 4. Keep every rep clean.", "exercises": [
      {"name": "Front Squat", "sets": 4, "reps": "5", "rest": 180},
      {"name": "Incline Dumbbell Press", "sets": 4, "reps": "8", "rest": 90},
      {"name": "One-Arm Dumbbell Row", "sets": 4, "reps": "8 each side", "rest": 90},
      {"name": "Hip Thrust", "sets": 4, "reps": "8", "rest": 90},
      {"name": "Farmer's Carry", "sets": 4, "reps": "30 m", "rest": 60}]}],
  "schedule": [
    {"workout": "a", "weekdays": [1], "from": 1, "to": 4},
    {"workout": "b", "weekdays": [3], "from": 1, "to": 4},
    {"workout": "c", "weekdays": [5], "from": 1, "to": 4},
    {"workout": "a2", "weekdays": [1], "from": 5, "to": 8},
    {"workout": "b2", "weekdays": [3], "from": 5, "to": 8},
    {"workout": "c2", "weekdays": [5], "from": 5, "to": 8}]
}$j$::jsonb),
('upper-lower', 'program', 'Upper Lower',
 'Four days a week: two upper-body and two lower-body sessions for steady muscle and strength.',
 'intermediate', 'gym', 6, 4, 60, 30, $j${
  "workouts": [
    {"key": "ua", "name": "Upper A", "exercises": [
      {"name": "Barbell Bench Press", "sets": 4, "reps": "6–8", "rest": 120},
      {"name": "Barbell Row", "sets": 4, "reps": "6–8", "rest": 120},
      {"name": "Seated Dumbbell Shoulder Press", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Lat Pulldown", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Barbell Curl", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Tricep Pushdown", "sets": 3, "reps": "12", "rest": 60}]},
    {"key": "la", "name": "Lower A", "exercises": [
      {"name": "Back Squat", "sets": 4, "reps": "6–8", "rest": 150},
      {"name": "Romanian Deadlift", "sets": 3, "reps": "10", "rest": 120},
      {"name": "Leg Press", "sets": 3, "reps": "12", "rest": 90},
      {"name": "Lying Leg Curl", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Standing Calf Raise", "sets": 4, "reps": "12", "rest": 60}]},
    {"key": "ub", "name": "Upper B", "exercises": [
      {"name": "Incline Dumbbell Press", "sets": 4, "reps": "8–10", "rest": 90},
      {"name": "Pull-Up", "sets": 4, "reps": "6–8", "rest": 120},
      {"name": "Lateral Raise", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Seated Cable Row", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Dumbbell Hammer Curl", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Overhead Tricep Extension", "sets": 3, "reps": "12", "rest": 60}]},
    {"key": "lb", "name": "Lower B", "exercises": [
      {"name": "Deadlift", "sets": 3, "reps": "5", "rest": 180},
      {"name": "Bulgarian Split Squat", "sets": 3, "reps": "8 each leg", "rest": 90},
      {"name": "Hip Thrust", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Leg Extension", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Hanging Leg Raise", "sets": 3, "reps": "10", "rest": 60}]}],
  "schedule": [
    {"workout": "ua", "weekdays": [1], "from": 1, "to": 6},
    {"workout": "la", "weekdays": [2], "from": 1, "to": 6},
    {"workout": "ub", "weekdays": [4], "from": 1, "to": 6},
    {"workout": "lb", "weekdays": [5], "from": 1, "to": 6}]
}$j$::jsonb),
('lean-and-fit', 'program', 'Lean and Fit',
 'Fat-loss circuits three times a week, plus one easy cardio session on any day.',
 'beginner', 'gym', 6, 4, 40, 40, $j${
  "workouts": [
    {"key": "a", "name": "Circuit A", "notes": "Go straight from one exercise to the next. Rest 90 s after each round.", "exercises": [
      {"name": "Goblet Squat", "sets": 3, "reps": "12", "rest": 15},
      {"name": "Push-Up", "sets": 3, "reps": "10", "rest": 15, "notes": "Hands on a bench if needed."},
      {"name": "Seated Cable Row", "sets": 3, "reps": "12", "rest": 15},
      {"name": "Kettlebell Swing", "sets": 3, "reps": "15", "rest": 15},
      {"name": "Mountain Climber", "sets": 3, "reps": "30 s", "rest": 90}]},
    {"key": "b", "name": "Circuit B", "notes": "Go straight from one exercise to the next. Rest 90 s after each round.", "exercises": [
      {"name": "Walking Lunge", "sets": 3, "reps": "10 each leg", "rest": 15},
      {"name": "Lat Pulldown", "sets": 3, "reps": "12", "rest": 15},
      {"name": "Seated Dumbbell Shoulder Press", "sets": 3, "reps": "12", "rest": 15},
      {"name": "Glute Bridge", "sets": 3, "reps": "15", "rest": 15},
      {"name": "Burpee", "sets": 3, "reps": "8", "rest": 90}]},
    {"key": "c", "name": "Circuit C", "notes": "Go straight from one exercise to the next. Rest 90 s after each round.", "exercises": [
      {"name": "Leg Press", "sets": 3, "reps": "15", "rest": 15},
      {"name": "Chest Press Machine", "sets": 3, "reps": "12", "rest": 15},
      {"name": "One-Arm Dumbbell Row", "sets": 3, "reps": "12 each side", "rest": 15},
      {"name": "Russian Twist", "sets": 3, "reps": "20", "rest": 15},
      {"name": "Rowing Machine", "sets": 3, "reps": "250 m", "rest": 90}]},
    {"key": "cardio", "name": "Easy Cardio", "notes": "An easy pace you could still talk at.", "exercises": [
      {"name": "Stationary Bike", "sets": 1, "reps": "30 min", "rest": 0}]}],
  "schedule": [
    {"workout": "a", "weekdays": [1], "from": 1, "to": 6},
    {"workout": "b", "weekdays": [3], "from": 1, "to": 6},
    {"workout": "c", "weekdays": [5], "from": 1, "to": 6},
    {"workout": "cardio", "weekdays": [], "from": 1, "to": 6}]
}$j$::jsonb),
('glutes-and-legs', 'program', 'Glutes and Legs',
 'Two lower-body days built around the hip thrust and squat, and one upper-body day.',
 'intermediate', 'gym', 6, 3, 55, 50, $j${
  "workouts": [
    {"key": "l1", "name": "Glutes and Legs 1", "exercises": [
      {"name": "Hip Thrust", "sets": 4, "reps": "8–10", "rest": 120, "notes": "Pause for one second at the top."},
      {"name": "Back Squat", "sets": 4, "reps": "8", "rest": 150},
      {"name": "Walking Lunge", "sets": 3, "reps": "10 each leg", "rest": 90},
      {"name": "Cable Kickback", "sets": 3, "reps": "12 each leg", "rest": 60},
      {"name": "Standing Calf Raise", "sets": 3, "reps": "15", "rest": 60}]},
    {"key": "u", "name": "Glutes and Legs: Upper", "exercises": [
      {"name": "Lat Pulldown", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Seated Dumbbell Shoulder Press", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Seated Cable Row", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Push-Up", "sets": 3, "reps": "8–12", "rest": 60},
      {"name": "Face Pull", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Dead Bug", "sets": 3, "reps": "8 each side", "rest": 45}]},
    {"key": "l2", "name": "Glutes and Legs 2", "exercises": [
      {"name": "Romanian Deadlift", "sets": 4, "reps": "8–10", "rest": 120},
      {"name": "Bulgarian Split Squat", "sets": 3, "reps": "8 each leg", "rest": 90},
      {"name": "Glute Bridge", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Lying Leg Curl", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Side Plank", "sets": 3, "reps": "30 s each side", "rest": 45}]}],
  "schedule": [
    {"workout": "l1", "weekdays": [1], "from": 1, "to": 6},
    {"workout": "u", "weekdays": [3], "from": 1, "to": 6},
    {"workout": "l2", "weekdays": [5], "from": 1, "to": 6}]
}$j$::jsonb),
('home-strength', 'program', 'Home Strength',
 'For clients who train at home with a pair of dumbbells. No gym needed.',
 'beginner', 'home', 4, 3, 35, 60, $j${
  "workouts": [
    {"key": "a", "name": "Home A", "exercises": [
      {"name": "Goblet Squat", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Push-Up", "sets": 3, "reps": "8–12", "rest": 60},
      {"name": "One-Arm Dumbbell Row", "sets": 3, "reps": "10 each side", "rest": 60, "notes": "Free hand on a chair."},
      {"name": "Glute Bridge", "sets": 3, "reps": "15", "rest": 45},
      {"name": "Plank", "sets": 3, "reps": "30 s", "rest": 45}]},
    {"key": "b", "name": "Home B", "exercises": [
      {"name": "Walking Lunge", "sets": 3, "reps": "10 each leg", "rest": 60},
      {"name": "Seated Dumbbell Shoulder Press", "sets": 3, "reps": "10", "rest": 60, "notes": "Sit tall on a chair."},
      {"name": "Romanian Deadlift", "sets": 3, "reps": "10", "rest": 60, "notes": "With dumbbells."},
      {"name": "Dumbbell Hammer Curl", "sets": 3, "reps": "12", "rest": 45},
      {"name": "Dead Bug", "sets": 3, "reps": "8 each side", "rest": 45}]},
    {"key": "c", "name": "Home C", "exercises": [
      {"name": "Bulgarian Split Squat", "sets": 3, "reps": "8 each leg", "rest": 60, "notes": "Back foot on a chair or couch."},
      {"name": "Bench Dip", "sets": 3, "reps": "10", "rest": 60, "notes": "Use a sturdy chair."},
      {"name": "Rear Delt Fly", "sets": 3, "reps": "12", "rest": 45},
      {"name": "Burpee", "sets": 3, "reps": "8", "rest": 60},
      {"name": "Side Plank", "sets": 2, "reps": "20 s each side", "rest": 45}]}],
  "schedule": [
    {"workout": "a", "weekdays": [1], "from": 1, "to": 4},
    {"workout": "b", "weekdays": [3], "from": 1, "to": 4},
    {"workout": "c", "weekdays": [5], "from": 1, "to": 4}]
}$j$::jsonb),
('first-session', 'workout', 'First Session',
 'A gentle first workout to see how a new client moves before you plan their program.',
 'beginner', 'gym', 1, 1, 40, 110, $j${
  "workouts": [
    {"key": "w", "name": "First Session", "notes": "Watch the form on every exercise and note what to work on.", "exercises": [
      {"name": "Goblet Squat", "sets": 2, "reps": "10", "rest": 60},
      {"name": "Push-Up", "sets": 2, "reps": "Max, good form", "rest": 60},
      {"name": "Lat Pulldown", "sets": 2, "reps": "10", "rest": 60},
      {"name": "Glute Bridge", "sets": 2, "reps": "12", "rest": 45},
      {"name": "Dead Bug", "sets": 2, "reps": "8 each side", "rest": 45},
      {"name": "Plank", "sets": 2, "reps": "20 s", "rest": 45}]}]
}$j$::jsonb),
('full-body-express', 'workout', 'Full Body Express',
 'Thirty minutes, the whole body, for a busy day.',
 'intermediate', 'gym', 1, 1, 30, 120, $j${
  "workouts": [
    {"key": "w", "name": "Full Body Express", "exercises": [
      {"name": "Thruster", "sets": 3, "reps": "10", "rest": 60},
      {"name": "Pull-Up", "sets": 3, "reps": "6–8", "rest": 60},
      {"name": "Kettlebell Swing", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Push-Up", "sets": 3, "reps": "12", "rest": 45},
      {"name": "Mountain Climber", "sets": 3, "reps": "30 s", "rest": 45}]}]
}$j$::jsonb),
('push', 'workout', 'Push',
 'Chest, shoulders and triceps.',
 'intermediate', 'gym', 1, 1, 50, 130, $j${
  "workouts": [
    {"key": "w", "name": "Push", "exercises": [
      {"name": "Barbell Bench Press", "sets": 4, "reps": "6–8", "rest": 120},
      {"name": "Overhead Press", "sets": 3, "reps": "8", "rest": 120},
      {"name": "Incline Dumbbell Press", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Lateral Raise", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Cable Crossover", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Tricep Pushdown", "sets": 3, "reps": "12", "rest": 60}]}]
}$j$::jsonb),
('pull', 'workout', 'Pull',
 'Back and biceps, with a heavy deadlift first.',
 'intermediate', 'gym', 1, 1, 50, 140, $j${
  "workouts": [
    {"key": "w", "name": "Pull", "exercises": [
      {"name": "Deadlift", "sets": 3, "reps": "5", "rest": 180},
      {"name": "Pull-Up", "sets": 4, "reps": "6–8", "rest": 120},
      {"name": "Seated Cable Row", "sets": 3, "reps": "10", "rest": 90},
      {"name": "Face Pull", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Barbell Curl", "sets": 3, "reps": "10", "rest": 60},
      {"name": "Dumbbell Hammer Curl", "sets": 2, "reps": "12", "rest": 60}]}]
}$j$::jsonb),
('legs', 'workout', 'Legs',
 'Quads, hamstrings, glutes and calves.',
 'intermediate', 'gym', 1, 1, 55, 150, $j${
  "workouts": [
    {"key": "w", "name": "Legs", "exercises": [
      {"name": "Back Squat", "sets": 4, "reps": "6–8", "rest": 150},
      {"name": "Romanian Deadlift", "sets": 3, "reps": "10", "rest": 120},
      {"name": "Leg Press", "sets": 3, "reps": "12", "rest": 90},
      {"name": "Leg Extension", "sets": 3, "reps": "15", "rest": 60},
      {"name": "Lying Leg Curl", "sets": 3, "reps": "12", "rest": 60},
      {"name": "Standing Calf Raise", "sets": 4, "reps": "12", "rest": 60}]}]
}$j$::jsonb),
('core-and-conditioning', 'workout', 'Core and Conditioning',
 'A short core and fitness finisher, or a session of its own.',
 'beginner', 'gym', 1, 1, 30, 160, $j${
  "workouts": [
    {"key": "w", "name": "Core and Conditioning", "exercises": [
      {"name": "Rowing Machine", "sets": 1, "reps": "5 min", "rest": 60, "notes": "Easy warm-up."},
      {"name": "Hanging Leg Raise", "sets": 3, "reps": "10", "rest": 45},
      {"name": "Cable Crunch", "sets": 3, "reps": "12", "rest": 45},
      {"name": "Russian Twist", "sets": 3, "reps": "20", "rest": 45},
      {"name": "Jump Rope", "sets": 5, "reps": "1 min", "rest": 30},
      {"name": "Farmer's Carry", "sets": 3, "reps": "30 m", "rest": 60}]}]
}$j$::jsonb)
on conflict (slug) do update
  set kind = excluded.kind, name = excluded.name, summary = excluded.summary, level = excluded.level,
      equipment = excluded.equipment, weeks = excluded.weeks, days_per_week = excluded.days_per_week,
      minutes = excluded.minutes, position = excluded.position, body = excluded.body;

-- The migration stops here if a template names an exercise the built-in library doesn't have
-- exactly once, its schedule doesn't fit its weeks, or a program has no schedule.
do $$
declare
  problem text;
begin
  select string_agg(distinct t.slug || ': ' || coalesce(x.value ->> 'name', '?'), ', ') into problem
    from public.voltrix_templates t
   cross join jsonb_array_elements(t.body -> 'workouts') w
   cross join jsonb_array_elements(w.value -> 'exercises') x
   where (select count(*) from public.exercises e
           where e.trainer_id is null and lower(e.name) = lower(x.value ->> 'name')) <> 1;
  if problem is not null then
    raise exception 'Voltrix templates name exercises the built-in library does not have: %', problem;
  end if;
  select string_agg(t.slug, ', ') into problem
    from public.voltrix_templates t
   cross join jsonb_array_elements(coalesce(t.body -> 'schedule', '[]'::jsonb)) s
   where not exists (
           select 1 from jsonb_array_elements(t.body -> 'workouts') w where w.value ->> 'key' = s.value ->> 'workout'
         )
      or (s.value ->> 'from')::int < 1
      or (s.value ->> 'to')::int > t.weeks
      or (s.value ->> 'to')::int < (s.value ->> 'from')::int;
  if problem is not null then
    raise exception 'Voltrix template schedules don''t fit: %', problem;
  end if;
  select string_agg(t.slug, ', ') into problem
    from public.voltrix_templates t
   where (t.kind = 'program') <> (jsonb_array_length(coalesce(t.body -> 'schedule', '[]'::jsonb)) > 0)
      or jsonb_array_length(coalesce(t.body -> 'workouts', '[]'::jsonb)) = 0
      or (t.kind = 'workout' and jsonb_array_length(t.body -> 'workouts') <> 1);
  if problem is not null then
    raise exception 'Voltrix templates are missing workouts or a schedule: %', problem;
  end if;
end;
$$;
