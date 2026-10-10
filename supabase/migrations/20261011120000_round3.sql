-- Round 3 of "all the ideas to make Voltrix better" (Ryan, 2026-10-10): bookings and money.
--
--   * Weekly repeat bookings. A trainer books the same time every week (session_series) in the
--     trainer's own time zone, so 07:00 stays 07:00. The sessions are real rows, made 12 weeks
--     ahead and topped up when Voltrix Coach opens and every night. One session changes like any
--     other; "this and later" moves the rest; ending the repeat names the booked sessions after
--     it for the app to remove.
--   * Session packs. A trainer sells a client a pack ("10 sessions, 3 left"), with an optional
--     end date. Every booking for that client uses a pack with room (the one that ends first),
--     whoever books it: the trainer, a repeat, the client, or a Voltrix Coach build from before
--     this change. A price typed for one session means "charge this one on its own".
--   * Paid or not. Sessions and packs carry the day they were paid and how (cash, EFT, card or
--     other). What a client owes is worked out, never typed: sessions done (and no-shows while the
--     trainer charges for them) that aren't on a pack and aren't paid, plus packs not paid.
--     Voltrix takes no payments: this is tracking only.
--   * Clients book open times. The trainer sets weekly hours and rules (booking_rules) and
--     either books straight away or approves each request (booking_requests). A linked client
--     sees the open times and books one. One booking per trainer at a time, checked again under
--     a lock, so two people never get the same time.
--   * Asking a trainer from the Trainers list. Someone without a trainer sends one request at a
--     time, after agreeing to what the trainer will see; accepting links them like an invite.
--   * A health form (PAR-Q style, in Voltrix's own words) the person fills in once and can change
--     or remove. Their trainers read it only through client_health_form(), under the round 1
--     rule (coached_user()). Any yes flags it for a doctor's go-ahead.
--   * A private calendar link per person (an .ics feed with an unguessable token that can be
--     reset or turned off), served by the calendar-feed Edge Function through calendar_feed(),
--     which only the service role may call.
--   * News (public.news) through tell(): what clients do in Voltrix is kept for the trainer's
--     Home and sent live. tell() is the one place round 4 adds phone notifications.
--
-- Builds on round 2 (20261010120000_round2.sql) and replaces one of its functions,
-- sessions_before_write() (same name and trigger; its four rules stay). Nothing here removes
-- rows or objects: removals are made by the apps under the row rules, and every new row is
-- cleaned up by "on delete cascade" or "set null", so delete_my_account() works as it is.

-- ---------- 1. Time zones and the trainer's choices ----------

-- time_zone: where the trainer works (or the person lives). Repeat bookings and booking hours
--   follow it, so a session at 07:00 stays at 07:00 (South Africa has no daylight saving).
-- accepting_clients: shown in the Trainers list; requests are refused when it is off.
-- charge_no_shows: a no-show uses a pack session and is owed like a session done.
alter table public.profiles
  add column time_zone text not null default 'Africa/Johannesburg'
    constraint profiles_time_zone_check check (char_length(time_zone) between 1 and 64),
  add column accepting_clients boolean not null default true,
  add column charge_no_shows boolean not null default true;

grant update (time_zone, accepting_clients, charge_no_shows) on public.profiles to authenticated;

-- A time zone must be one the database knows (the apps send the phone's, such as Europe/London).
create function public.profiles_check_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'That time zone isn''t known. Pick one from the list.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.profiles_check_time_zone() from public, anon, authenticated;

create trigger profiles_check_time_zone before insert or update of time_zone on public.profiles
  for each row when (new.time_zone <> 'Africa/Johannesburg') execute function public.profiles_check_time_zone();

-- self_booking: the trainer lets this client book in Voltrix (on by default; off per client).
-- doctor_ok_on: the day the trainer noted a doctor's go-ahead for this client (section 8).
alter table public.clients
  add column self_booking boolean not null default true,
  add column doctor_ok_on date
    constraint clients_doctor_ok_on_check check (doctor_ok_on is null or doctor_ok_on >= date '2000-01-01');

grant insert (self_booking, doctor_ok_on), update (self_booking, doctor_ok_on) on public.clients to authenticated;

-- Does this trainer have Voltrix Coach now (a trial, a plan, free access or the owner)? The rule
-- list_trainers() and has_coach_access() use, for any trainer. Used inside this file's
-- functions only.
create function public.coach_access_of(p_trainer uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = p_trainer
       and p.role = 'trainer'
       and (
         p.free_access
         or p.is_admin
         or p.trial_ends_at > now()
         or (p.subscription_status in ('active', 'past_due', 'cancelled') and p.subscription_expires_at > now())
       )
  );
$$;

revoke execute on function public.coach_access_of(uuid) from public, anon, authenticated;

-- ---------- 2. News ----------

-- What happened that a person should see in their app, kept until they have seen it: for
-- trainers, a client booked, asked for a time, cancelled, asked to train, or saved their health
-- form; for clients, the answer to a booking request or a request to train. Written only
-- through tell(). Each person reads, marks seen and clears their own.
create table public.news (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    constraint news_kind_check check (kind in ('booked', 'requested', 'cancelled', 'training_request', 'health',
                                                'booking_answered', 'training_answered')),
  client_id uuid references public.clients (id) on delete cascade,
  payload jsonb not null default '{}'
    constraint news_payload_check check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2000),
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index news_person_idx on public.news (person_id, created_at desc);
create index news_unseen_idx on public.news (person_id) where seen_at is null;
create index news_client_idx on public.news (client_id) where client_id is not null;

alter table public.news enable row level security;
revoke all on public.news from anon, authenticated;
grant select, delete on public.news to authenticated;
grant update (seen_at) on public.news to authenticated;

create policy news_select_own on public.news
  for select to authenticated using (person_id = (select auth.uid()));
create policy news_update_own on public.news
  for update to authenticated
  using (person_id = (select auth.uid()))
  with check (person_id = (select auth.uid()));
create policy news_delete_own on public.news
  for delete to authenticated using (person_id = (select auth.uid()));

-- Tells someone: keeps the news for them and sends it live ('news' on their inbox). Every new
-- piece of news goes through here, so round 4 adds phone notifications in this one place. Best
-- effort: a booking is never lost because its news couldn't be kept or sent.
create function public.tell(p_person uuid, p_kind text, p_client uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item uuid;
begin
  if p_person is null then
    return;
  end if;
  begin
    insert into public.news (person_id, kind, client_id, payload)
    values (p_person, p_kind, p_client, coalesce(p_payload, '{}'::jsonb))
    returning id into item;
  exception when others then
    raise warning 'Could not keep % news: %', p_kind, sqlerrm;
  end;
  perform public.send_to_inbox(p_person, 'news',
    jsonb_build_object('id', item, 'kind', p_kind, 'client_id', p_client));
end;
$$;

revoke execute on function public.tell(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- The news about one request is answered elsewhere (the request was withdrawn, answered or
-- settled): it is marked seen, and the trainer's open app hears 'news' with kind 'withdrawn'
-- (not kept) so it can update.
create function public.news_settled(p_person uuid, p_kind text, p_request uuid, p_live boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.news n
     set seen_at = now()
   where n.person_id = p_person
     and n.kind = p_kind
     and n.seen_at is null
     and n.payload ->> 'request_id' = p_request::text;
  if p_live then
    perform public.send_to_inbox(p_person, 'news', jsonb_build_object('kind', 'withdrawn', 'request_id', p_request));
  end if;
end;
$$;

revoke execute on function public.news_settled(uuid, text, uuid, boolean) from public, anon, authenticated;

-- ---------- 3. Packs and weekly repeats: the tables ----------

-- A pack of sessions sold to one client at one price for all of them, in the trainer's currency
-- at the time. Sessions use it while booked or done (and no-shows while the trainer charges for
-- them); a cancelled one gives its place back. expires_on: the last day a session may use it.
-- paid_on / paid_method: when and how the pack was paid (a pack is paid or not; a part-payment
-- goes in the note). Made only by sell_pack(); the trainer changes or removes their own.
-- Removing the client (or the trainer's account) removes their packs.
create table public.session_packs (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  sessions_total smallint not null
    constraint session_packs_sessions_check check (sessions_total between 1 and 200),
  price_cents integer not null
    constraint session_packs_price_check check (price_cents between 0 and 100000000),
  currency text not null
    constraint session_packs_currency_check check (currency ~ '^[A-Z]{3}$'),
  sold_on date not null,
  expires_on date,
  paid_on date,
  paid_method text
    constraint session_packs_paid_method_check check (paid_method is null or paid_method in ('cash', 'eft', 'card', 'other')),
  note text
    constraint session_packs_note_check check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_packs_expiry_check check (expires_on is null or expires_on >= sold_on),
  constraint session_packs_paid_check check (paid_method is null or paid_on is not null),
  -- Each session's share must fit a session price (100 000 at most).
  constraint session_packs_share_check check (price_cents <= sessions_total * 10000000)
);

create index session_packs_client_idx on public.session_packs (client_id, sold_on);
create index session_packs_trainer_idx on public.session_packs (trainer_id);

create trigger session_packs_set_updated_at before update on public.session_packs
  for each row execute function public.set_updated_at();

alter table public.session_packs enable row level security;
revoke all on public.session_packs from anon, authenticated;
grant select, delete on public.session_packs to authenticated;
grant update (sessions_total, price_cents, expires_on, paid_on, paid_method, note) on public.session_packs to authenticated;

create policy session_packs_select_own on public.session_packs
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy session_packs_update_own on public.session_packs
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));
create policy session_packs_delete_own on public.session_packs
  for delete to authenticated using (trainer_id = (select auth.uid()));

-- The same booking every week: on weekday (1 Monday ... 7 Sunday) at start_time in time_zone,
-- from starts_on until ends_on (none: until stopped). made_until: the last day already made, so
-- a session removed or moved by hand is never made again. price_cents: a price typed for every
-- session (then no pack is used); null: each session is priced when it is made (a pack with
-- room, else the client's rate). Made and changed only through the functions in section 5.
create table public.session_series (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  title text
    constraint session_series_title_check check (title is null or char_length(btrim(title)) between 1 and 120),
  weekday smallint not null
    constraint session_series_weekday_check check (weekday between 1 and 7),
  start_time time not null,
  duration_minutes integer not null
    constraint session_series_duration_check check (duration_minutes between 5 and 600),
  time_zone text not null,
  location text
    constraint session_series_location_check check (location is null or char_length(location) <= 200),
  online boolean not null default false,
  notes text
    constraint session_series_notes_check check (notes is null or char_length(notes) <= 2000),
  price_cents integer
    constraint session_series_price_check check (price_cents is null or price_cents between 0 and 10000000),
  starts_on date not null,
  ends_on date,
  made_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint session_series_who_check check (client_id is not null or title is not null),
  constraint session_series_end_check check (ends_on is null or ends_on >= starts_on - 1)
);

create index session_series_trainer_idx on public.session_series (trainer_id, ends_on);
create index session_series_client_idx on public.session_series (client_id) where client_id is not null;

create trigger session_series_set_updated_at before update on public.session_series
  for each row execute function public.set_updated_at();

alter table public.session_series enable row level security;
revoke all on public.session_series from anon, authenticated;
grant select on public.session_series to authenticated;

create policy session_series_select_own on public.session_series
  for select to authenticated using (trainer_id = (select auth.uid()));

-- ---------- 4. Sessions: repeat, pack, paid, who booked or cancelled in Voltrix ----------

-- series_id: the repeat booking that made it. pack_id: the pack it uses (its price is then the
-- pack's share). paid_on / paid_method: when and how it was paid (a pack session is paid
-- through its pack). booked_by: the person who booked it in Voltrix (null when the trainer
-- did). cancelled_by: the person who cancelled it in Voltrix (cleared when it is booked again).
-- client_note: what the client wrote when booking it in Voltrix (the trainer's notes stay theirs).
alter table public.sessions
  add column series_id uuid references public.session_series (id) on delete set null,
  add column pack_id uuid references public.session_packs (id) on delete set null,
  add column paid_on date,
  add column paid_method text
    constraint sessions_paid_method_check check (paid_method is null or paid_method in ('cash', 'eft', 'card', 'other')),
  add column booked_by uuid references public.profiles (id) on delete set null,
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column client_note text
    constraint sessions_client_note_check check (client_note is null or char_length(client_note) <= 300),
  add constraint sessions_paid_check check (paid_method is null or paid_on is not null),
  add constraint sessions_pack_client_check check (pack_id is null or client_id is not null);

create index sessions_series_idx on public.sessions (series_id, starts_at) where series_id is not null;
create index sessions_pack_idx on public.sessions (pack_id) where pack_id is not null;
create index sessions_booked_by_idx on public.sessions (booked_by) where booked_by is not null;
create index sessions_cancelled_by_idx on public.sessions (cancelled_by) where cancelled_by is not null;

grant insert (pack_id, paid_on, paid_method), update (pack_id, paid_on, paid_method) on public.sessions to authenticated;

-- How many more sessions a pack can take: its size, less its sessions that are booked or done
-- (and no-shows while the trainer charges for them). p_except leaves out the session being
-- saved. Runs as the person saving (a trainer reads only their own packs and sessions), so it
-- shows nothing that isn't theirs; the sessions trigger needs it for trainers.
create function public.pack_room(p_pack uuid, p_except uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select k.sessions_total - (
           select count(*)::int
             from public.sessions s
            where s.pack_id = k.id
              and s.id is distinct from p_except
              and (s.status in ('scheduled', 'completed') or (s.status = 'no_show' and p.charge_no_shows)))
    from public.session_packs k
    join public.profiles p on p.id = k.trainer_id
   where k.id = p_pack;
$$;

revoke execute on function public.pack_room(uuid, uuid) from public, anon;
grant execute on function public.pack_room(uuid, uuid) to authenticated;

-- The pack a session of this client on this day (the trainer's day) uses: of the trainer's packs
-- for the client sold by that day, not ended by it and with room, the one that ends first (packs
-- with no end last), then the oldest. Null when none has room.
create function public.pick_pack(p_trainer uuid, p_client uuid, p_day date, p_except uuid)
returns uuid
language sql
stable
set search_path = ''
as $$
  select k.id
    from public.session_packs k
   where k.trainer_id = p_trainer
     and k.client_id = p_client
     and k.sold_on <= p_day
     and (k.expires_on is null or k.expires_on >= p_day)
     and public.pack_room(k.id, p_except) > 0
   order by k.expires_on nulls last, k.sold_on, k.created_at, k.id
   limit 1;
$$;

revoke execute on function public.pick_pack(uuid, uuid, date, uuid) from public, anon;
grant execute on function public.pick_pack(uuid, uuid, date, uuid) to authenticated;

-- Before a session is saved (replaces round 2's version; its four rules stay as they were):
--   * Booking lock. A new session, or one whose time, length or status changes (not to
--     cancelled), waits for the trainer's booking lock (the one book_slot() holds), so a client
--     booking in Voltrix at that moment sees it. The trainer may still book over other sessions.
--   * Pack. A new session for a client uses a pack with room (pick_pack()) unless the app sends
--     a price or a paid day with it: a typed price means "charge this one on its own". So does a
--     price typed later for a pack session: it comes off its pack. Moved to another client, it
--     comes off the first client's pack and looks again. Booked again after a cancel (or counted
--     again), it keeps its pack while there is room, else looks again; moved past its pack's end,
--     it looks again. A pack the app picks must be this trainer's and client's, last until the
--     session's day and have room. Each pack choice holds a lock per client, so two bookings
--     can't both take a pack's last session.
--   * Price. On a pack: the pack's share (pack price / sessions, to the cent), in the pack's
--     currency. Taken off a pack while still booked: priced like a new booking; once done,
--     missed or cancelled it keeps its price. Otherwise as round 2: a session that gets a
--     client with no price takes the client's rate, else the usual price; a price the app
--     sends, 0 included, is kept; a price is tagged with the trainer's currency when it is set
--     or changed.
--   * Paid. A pack session can't be marked paid on its own (its pack is), and a paid session
--     can't go on a pack. The paid day is from 2020 to tomorrow; no day, no method.
--   * "Done" or "no-show" is refused before the session has started; marked_at follows the
--     status; cancelled_by is cleared once it isn't cancelled; booked_by and client_note go
--     when the session moves to another client.
-- Runs as the person saving, so it reads only their own clients, packs and profile; inside this
-- file's functions it runs as their owner and every read is tied to new.trainer_id.
create or replace function public.sessions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  sent_price boolean := new.price_cents is not null
                        and (tg_op = 'INSERT' or new.price_cents is distinct from old.price_cents);
  old_pack uuid;
  choose boolean := false;
  charge boolean;
  tz text;
  cur text;
  day date;
  pk public.session_packs;
begin
  if new.trainer_id is not null and new.status <> 'cancelled'
     and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at
          or new.duration_minutes is distinct from old.duration_minutes or new.status is distinct from old.status) then
    perform pg_advisory_xact_lock(hashtextextended('book:' || new.trainer_id::text, 0));
  end if;
  select p.time_zone, p.currency, p.charge_no_shows into tz, cur, charge
    from public.profiles p where p.id = new.trainer_id;
  tz := coalesce(tz, 'Africa/Johannesburg');
  day := (new.starts_at at time zone tz)::date;
  if tg_op = 'UPDATE' then
    old_pack := old.pack_id;
    if new.client_id is distinct from old.client_id then
      new.booked_by := null;
      new.client_note := null;
    end if;
  end if;
  if new.paid_on is null then
    new.paid_method := null;
  end if;

  -- Which pack.
  if new.client_id is null then
    new.pack_id := null;
  elsif tg_op = 'INSERT' then
    choose := new.pack_id is null and not sent_price and new.paid_on is null and new.status <> 'cancelled';
  elsif new.client_id is distinct from old.client_id then
    if new.pack_id is not distinct from old.pack_id then
      new.pack_id := null;
      choose := not sent_price and new.paid_on is null and new.status <> 'cancelled';
    end if;
  elsif new.pack_id is not null and new.pack_id is not distinct from old.pack_id then
    if sent_price then
      new.pack_id := null;
    elsif new.status <> 'cancelled'
          and (new.starts_at is distinct from old.starts_at or new.status is distinct from old.status) then
      perform pg_advisory_xact_lock(hashtextextended('pack:' || new.client_id::text, 0));
      select k.* into pk from public.session_packs k where k.id = new.pack_id and k.trainer_id = new.trainer_id;
      if pk.id is null or (pk.expires_on is not null and pk.expires_on < day)
         or ((new.status in ('scheduled', 'completed') or (new.status = 'no_show' and coalesce(charge, true)))
             and not (old.status in ('scheduled', 'completed') or (old.status = 'no_show' and coalesce(charge, true)))
             and coalesce(public.pack_room(new.pack_id, new.id), 0) <= 0) then
        new.pack_id := null;
        choose := new.paid_on is null;
      end if;
    end if;
  end if;

  if choose then
    perform pg_advisory_xact_lock(hashtextextended('pack:' || new.client_id::text, 0));
    new.pack_id := public.pick_pack(new.trainer_id, new.client_id, day, new.id);
  elsif new.pack_id is not null and new.pack_id is distinct from old_pack then
    perform pg_advisory_xact_lock(hashtextextended('pack:' || new.client_id::text, 0));
    select k.* into pk from public.session_packs k where k.id = new.pack_id and k.trainer_id = new.trainer_id;
    if pk.id is null or pk.client_id is distinct from new.client_id then
      raise exception 'That pack is for another client.' using errcode = '22023';
    end if;
    if pk.expires_on is not null and pk.expires_on < day then
      raise exception 'That pack ends before this session.' using errcode = '22023';
    end if;
    if (new.status in ('scheduled', 'completed') or (new.status = 'no_show' and coalesce(charge, true)))
       and coalesce(public.pack_room(pk.id, new.id), 0) <= 0 then
      raise exception 'That pack has no sessions left.' using errcode = '22023';
    end if;
  end if;

  -- Paid.
  if new.pack_id is not null and new.paid_on is not null then
    if tg_op = 'INSERT' or new.paid_on is distinct from old.paid_on then
      raise exception 'This session is paid for with its pack. Mark the pack as paid instead.' using errcode = '22023';
    elsif new.pack_id is distinct from old.pack_id then
      raise exception 'This session is marked paid. Mark it unpaid before putting it on a pack.' using errcode = '22023';
    end if;
  end if;
  if new.paid_on is not null and (tg_op = 'INSERT' or new.paid_on is distinct from old.paid_on)
     and new.paid_on not between date '2020-01-01' and (now() at time zone tz)::date + 1 then
    raise exception 'Pick the day it was paid.' using errcode = '22023';
  end if;

  -- The price and currency.
  if new.pack_id is not null then
    if pk.id is distinct from new.pack_id then
      select k.* into pk from public.session_packs k where k.id = new.pack_id;
    end if;
    new.price_cents := round(pk.price_cents::numeric / pk.sessions_total)::int;
    new.currency := pk.currency;
  else
    if old_pack is not null and not sent_price and new.status = 'scheduled' then
      new.price_cents := null;
    end if;
    if new.price_cents is null and new.client_id is not null
       and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id or old_pack is not null) then
      select coalesce(c.session_price_cents, p.session_price_cents) into new.price_cents
        from public.clients c
        join public.profiles p on p.id = c.trainer_id
       where c.id = new.client_id
         and c.trainer_id = new.trainer_id;
    end if;
    if new.price_cents is null then
      new.currency := null;
    elsif tg_op = 'INSERT' or new.price_cents is distinct from old.price_cents or old.currency is null
          or old_pack is not null then
      new.currency := coalesce(cur, 'ZAR');
    else
      new.currency := old.currency;
    end if;
  end if;

  -- Round 2: done or no-show once started; marked_at follows the status.
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
  if new.status <> 'cancelled' then
    new.cancelled_by := null;
  end if;
  return new;
end;
$$;

-- A pack is sold in the trainer's currency, on the trainer's today unless a day is given, and
-- keeps that currency. It can't shrink below what is booked or done from it, end before a
-- session booked on it, or be marked paid on a day in the future.
create function public.session_packs_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
  cur text;
  counted integer;
begin
  select p.time_zone, p.currency into tz, cur from public.profiles p where p.id = new.trainer_id;
  tz := coalesce(tz, 'Africa/Johannesburg');
  if new.paid_on is null then
    new.paid_method := null;
  end if;
  if tg_op = 'INSERT' then
    new.currency := coalesce(cur, 'ZAR');
    new.sold_on := coalesce(new.sold_on, (now() at time zone tz)::date);
  else
    new.currency := old.currency;
    if new.sessions_total < old.sessions_total
       or new.expires_on is distinct from old.expires_on then
      perform pg_advisory_xact_lock(hashtextextended('pack:' || new.client_id::text, 0));
    end if;
    if new.sessions_total < old.sessions_total then
      select count(*)::int into counted
        from public.sessions s
        join public.profiles p on p.id = s.trainer_id
       where s.pack_id = new.id
         and (s.status in ('scheduled', 'completed') or (s.status = 'no_show' and p.charge_no_shows));
      if new.sessions_total < counted then
        raise exception 'This pack has % sessions booked or done. Pick % or more.', counted, counted using errcode = '22023';
      end if;
    end if;
    if new.expires_on is not null and new.expires_on is distinct from old.expires_on
       and exists (
         select 1 from public.sessions s
          where s.pack_id = new.id
            and s.status <> 'cancelled'
            and (s.starts_at at time zone tz)::date > new.expires_on
       ) then
      raise exception 'Sessions on this pack run past that day. Pick a later day.' using errcode = '22023';
    end if;
  end if;
  if new.paid_on is not null and (tg_op = 'INSERT' or new.paid_on is distinct from old.paid_on)
     and new.paid_on not between date '2020-01-01' and (now() at time zone tz)::date + 1 then
    raise exception 'Pick the day it was paid.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.session_packs_before_write() from public, anon, authenticated;

create trigger session_packs_before_write before insert or update on public.session_packs
  for each row execute function public.session_packs_before_write();

-- A pack's price or size changed: its sessions take the new share (the sessions trigger works
-- it out again when a session on a pack is saved without a typed price).
create function public.session_packs_after_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.sessions s
     set pack_id = s.pack_id
   where s.pack_id = new.id
     and s.trainer_id = new.trainer_id;
  return null;
end;
$$;

revoke execute on function public.session_packs_after_update() from public, anon, authenticated;

create trigger session_packs_after_update after update of price_cents, sessions_total on public.session_packs
  for each row when (new.price_cents is distinct from old.price_cents or new.sessions_total is distinct from old.sessions_total)
  execute function public.session_packs_after_update();

-- ---------- 5. Weekly repeats: the functions ----------

-- Makes a repeat booking's sessions from the day after made_until up to 12 weeks ahead (or its
-- last day): only times still to come, days without a session of it already, and not the days in
-- p_skip, while its client isn't archived. One statement, so the client hears one 'session'.
-- Each session is priced by the sessions trigger (a pack with room, the client's rate) unless the
-- repeat has a typed price. Returns how many it made.
create function public.make_series_sessions(p_series uuid, p_skip date[] default '{}')
returns integer
language plpgsql
set search_path = ''
as $$
declare
  ss public.session_series;
  today date;
  last_day date;
  first_day date;
  made integer := 0;
begin
  select * into ss from public.session_series x where x.id = p_series for update;
  if ss.id is null then
    return 0;
  end if;
  if ss.client_id is not null
     and exists (select 1 from public.clients c where c.id = ss.client_id and c.status = 'archived') then
    return 0;
  end if;
  today := (now() at time zone ss.time_zone)::date;
  last_day := today + 83;
  if ss.ends_on is not null and ss.ends_on < last_day then
    last_day := ss.ends_on;
  end if;
  first_day := greatest(ss.made_until + 1, ss.starts_on, today);
  first_day := first_day + ((ss.weekday - extract(isodow from first_day)::int + 7) % 7);
  if first_day <= last_day then
    insert into public.sessions
      (trainer_id, client_id, title, starts_at, duration_minutes, location, notes, online, price_cents, series_id)
    select ss.trainer_id, ss.client_id, ss.title, (d::date + ss.start_time) at time zone ss.time_zone,
           ss.duration_minutes, ss.location, ss.notes, ss.online, ss.price_cents, ss.id
      from generate_series(first_day::timestamp, last_day::timestamp, interval '7 days') d
     where ((d::date + ss.start_time) at time zone ss.time_zone) > now()
       and not (d::date = any (coalesce(p_skip, '{}'::date[])))
       and not exists (
         select 1 from public.sessions s
          where s.series_id = ss.id
            and s.starts_at >= (d::date::timestamp at time zone ss.time_zone)
            and s.starts_at < ((d::date + 1)::timestamp at time zone ss.time_zone)
       )
     order by d;
    get diagnostics made = row_count;
  end if;
  if last_day > ss.made_until then
    update public.session_series x set made_until = last_day where x.id = ss.id;
  end if;
  return made;
end;
$$;

revoke execute on function public.make_series_sessions(uuid, date[]) from public, anon, authenticated;

-- Book the same time every week for one of the signed-in trainer's clients (or blocked time with
-- p_title when p_client is null). The first session is at p_starts_at; the weekday and time come
-- from it on the trainer's clock. p_until: the last day (none: until stopped, 12 weeks made at a
-- time). p_skip: days left out (clashes the trainer chose to skip). p_price_cents: a price for
-- every session (no pack used); null: a pack with room, else the client's rate, as each is made.
-- Returns {series_id, booked, first, last}.
create function public.book_series(
  p_client uuid,
  p_title text,
  p_starts_at timestamptz,
  p_duration integer,
  p_location text default null,
  p_online boolean default false,
  p_notes text default null,
  p_price_cents integer default null,
  p_until date default null,
  p_skip date[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
  tz text;
  local_start timestamp;
  first_day date;
  series uuid;
  booked integer;
  first_at timestamptz;
  last_at timestamptz;
  v_title text := case when p_client is null then nullif(left(btrim(coalesce(p_title, '')), 120), '') end;
  v_place text := nullif(left(btrim(coalesce(p_location, '')), 200), '');
  v_notes text := nullif(left(btrim(coalesce(p_notes, '')), 2000), '');
begin
  select p.time_zone into tz from public.profiles p where p.id = me;
  if p_client is not null
     and not exists (select 1 from public.clients c where c.id = p_client and c.trainer_id = me and c.status = 'active') then
    raise exception 'This client can''t be booked now.' using errcode = '22023';
  end if;
  if p_client is null and v_title is null then
    raise exception 'Give this time a name, like "Group class".' using errcode = '22023';
  end if;
  if p_starts_at is null or p_duration is null or p_duration not between 5 and 600 then
    raise exception 'Pick a start time and a length from 5 minutes to 10 hours.' using errcode = '22023';
  end if;
  if p_starts_at <= now() then
    raise exception 'Start a repeat booking at a time still to come.' using errcode = '22023';
  end if;
  if p_price_cents is not null and p_price_cents not between 0 and 10000000 then
    raise exception 'Enter a price up to 100 000.' using errcode = '22023';
  end if;
  local_start := p_starts_at at time zone tz;
  first_day := local_start::date;
  if first_day > (now() at time zone tz)::date + 366 then
    raise exception 'Pick a first day within the next year.' using errcode = '22023';
  end if;
  if p_until is not null and (p_until < first_day or p_until > first_day + 366) then
    raise exception 'Pick a last day after the first and within a year of it.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_skip), 0) > 53 then
    raise exception 'Skip up to 53 weeks.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book:' || me::text, 0));
  if (select count(*) from public.session_series s
       where s.trainer_id = me and (s.ends_on is null or s.ends_on >= (now() at time zone tz)::date)) >= 100 then
    raise exception 'You have 100 repeat bookings. Stop some you no longer use first.' using errcode = '22023';
  end if;
  insert into public.session_series
    (trainer_id, client_id, title, weekday, start_time, duration_minutes, time_zone, location, online, notes,
     price_cents, starts_on, ends_on, made_until)
  values
    (me, p_client, v_title, extract(isodow from first_day), local_start::time, p_duration, tz, v_place,
     coalesce(p_online, false) and p_client is not null, v_notes, p_price_cents, first_day, p_until, first_day - 1)
  returning id into series;
  booked := public.make_series_sessions(series, p_skip);
  select min(s.starts_at), max(s.starts_at) into first_at, last_at from public.sessions s where s.series_id = series;
  return jsonb_build_object('series_id', series, 'booked', booked, 'first', first_at, 'last', last_at);
end;
$$;

revoke execute on function public.book_series(uuid, text, timestamptz, integer, text, boolean, text, integer, date, date[])
  from public, anon;
grant execute on function public.book_series(uuid, text, timestamptz, integer, text, boolean, text, integer, date, date[])
  to authenticated;

-- "This and later": the session p_session and every later booked session of its repeat move to
-- the new time (and weekday, up to 6 days either way), length, place and online. Each keeps its
-- own week; notes, prices and packs stay; sessions done, missed or cancelled stay as they were.
-- Later sessions are made at the new time. Returns how many sessions moved.
create function public.change_series(
  p_session uuid,
  p_starts_at timestamptz,
  p_duration integer,
  p_location text default null,
  p_online boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ses public.sessions;
  ss public.session_series;
  new_local timestamp;
  shift integer;
  changed integer;
  v_place text := nullif(left(btrim(coalesce(p_location, '')), 200), '');
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into ses from public.sessions s where s.id = p_session and s.trainer_id = me;
  if ses.id is null or ses.series_id is null then
    raise exception 'This session doesn''t repeat.' using errcode = '22023';
  end if;
  if p_starts_at is null or p_duration is null or p_duration not between 5 and 600 then
    raise exception 'Pick a start time and a length from 5 minutes to 10 hours.' using errcode = '22023';
  end if;
  if p_starts_at <= now() then
    raise exception 'Pick a time still to come.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book:' || me::text, 0));
  select * into ss from public.session_series x where x.id = ses.series_id for update;
  new_local := p_starts_at at time zone ss.time_zone;
  shift := new_local::date - (ses.starts_at at time zone ss.time_zone)::date;
  if shift not between -6 and 6 then
    raise exception 'Pick a day in the same week to move every session to.' using errcode = '22023';
  end if;
  update public.sessions s
     set starts_at = (((s.starts_at at time zone ss.time_zone)::date + shift) + new_local::time) at time zone ss.time_zone,
         duration_minutes = p_duration,
         location = v_place,
         online = coalesce(p_online, false) and s.client_id is not null
   where s.series_id = ss.id
     and s.trainer_id = me
     and s.status = 'scheduled'
     and s.starts_at >= ses.starts_at;
  get diagnostics changed = row_count;
  update public.session_series x
     set weekday = extract(isodow from new_local::date),
         start_time = new_local::time,
         duration_minutes = p_duration,
         location = v_place,
         online = coalesce(p_online, false) and x.client_id is not null,
         starts_on = least(x.starts_on, new_local::date),
         made_until = x.made_until + shift,
         ends_on = case when x.ends_on is not null
                        then greatest(x.ends_on + shift, least(x.starts_on, new_local::date) - 1) end
   where x.id = ss.id;
  return changed;
end;
$$;

revoke execute on function public.change_series(uuid, timestamptz, integer, text, boolean) from public, anon;
grant execute on function public.change_series(uuid, timestamptz, integer, text, boolean) to authenticated;

-- Sets a repeat's last day (the trainer's day; null: no end). Later than before: more sessions
-- are made (while the trainer has Voltrix Coach). Earlier: none are made after it, and the
-- answer is the repeat's sessions still booked after that day, oldest first, which Voltrix Coach
-- then removes (the clients hear about it). "Stop from this session" passes the day before it.
create function public.set_series_end(p_series uuid, p_last_day date)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ss public.session_series;
  last_day date;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book:' || me::text, 0));
  select * into ss from public.session_series x where x.id = p_series and x.trainer_id = me for update;
  if ss.id is null then
    raise exception 'That repeat booking is no longer available.' using errcode = '22023';
  end if;
  if p_last_day is not null and p_last_day > ss.starts_on + 366 then
    raise exception 'Pick a last day within a year of the first.' using errcode = '22023';
  end if;
  last_day := case when p_last_day is not null then greatest(p_last_day, ss.starts_on - 1) end;
  -- Ending earlier: the days after the end count as not made, so a later "no end" makes them.
  update public.session_series x
     set ends_on = last_day,
         made_until = case when last_day < x.made_until then last_day else x.made_until end
   where x.id = ss.id;
  if last_day is null or last_day > ss.made_until then
    if public.coach_access_of(me) then
      perform public.make_series_sessions(ss.id);
    end if;
    return '{}'::uuid[];
  end if;
  return array(
    select s.id from public.sessions s
     where s.series_id = ss.id
       and s.status = 'scheduled'
       and s.starts_at >= ((last_day + 1)::timestamp at time zone ss.time_zone)
     order by s.starts_at);
end;
$$;

revoke execute on function public.set_series_end(uuid, date) from public, anon;
grant execute on function public.set_series_end(uuid, date) to authenticated;

-- Tops up the signed-in trainer's repeats to 12 weeks ahead. Voltrix Coach calls it when the
-- calendar or Home opens; the nightly job does the same for everyone. Nothing while the
-- trainer's plan has lapsed. Returns how many sessions it made.
create function public.extend_series()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s record;
  made integer := 0;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not public.coach_access_of(me) then
    return 0;
  end if;
  for s in
    select x.id from public.session_series x
     where x.trainer_id = me
       and (x.ends_on is null or x.ends_on > x.made_until)
       and x.made_until < (now() at time zone x.time_zone)::date + 83
  loop
    if made = 0 then
      perform pg_advisory_xact_lock(hashtextextended('book:' || me::text, 0));
    end if;
    made := made + public.make_series_sessions(s.id);
  end loop;
  return made;
end;
$$;

revoke execute on function public.extend_series() from public, anon;
grant execute on function public.extend_series() to authenticated;

-- The nightly job: every repeat of every trainer who has Voltrix Coach now, topped up.
create function public.extend_all_series()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  made integer := 0;
begin
  for s in
    select x.id, x.trainer_id from public.session_series x
     where (x.ends_on is null or x.ends_on > x.made_until)
       and x.made_until < (now() at time zone x.time_zone)::date + 83
       and public.coach_access_of(x.trainer_id)
     order by x.trainer_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('book:' || s.trainer_id::text, 0));
    made := made + public.make_series_sessions(s.id);
  end loop;
  return made;
end;
$$;

revoke execute on function public.extend_all_series() from public, anon, authenticated;

-- Before booking or moving a repeat: the signed-in trainer's sessions (blocked time too, not
-- cancelled ones) that would overlap it in the next 12 weeks (or until p_until), leaving out
-- p_series' own. day is the trainer's day of the clash, so the app can offer to skip it.
create function public.series_clashes(
  p_starts_at timestamptz,
  p_duration integer,
  p_until date default null,
  p_series uuid default null
)
returns table (day date, starts_at timestamptz, duration_minutes integer, name text)
language sql
stable
set search_path = ''
as $$
  with z as (
    select p.time_zone as tz from public.profiles p where p.id = auth.uid()
  ), occ as (
    select (p_starts_at at time zone z.tz)::date + 7 * k as d,
           (((p_starts_at at time zone z.tz)::date + 7 * k) + (p_starts_at at time zone z.tz)::time) at time zone z.tz as st
      from z
     cross join generate_series(0, 11) k
     where p_until is null or (p_starts_at at time zone z.tz)::date + 7 * k <= p_until
  )
  select occ.d, s.starts_at, s.duration_minutes,
         coalesce(nullif(btrim(c.first_name || ' ' || coalesce(c.last_name, '')), ''), s.title, 'Session')
    from occ
    join public.sessions s
      on s.trainer_id = auth.uid()
     and s.status <> 'cancelled'
     and s.starts_at < occ.st + make_interval(mins => greatest(5, least(600, coalesce(p_duration, 60))))
     and s.starts_at + make_interval(mins => s.duration_minutes) > occ.st
     and s.starts_at > occ.st - interval '11 hours'
     and (p_series is null or s.series_id is distinct from p_series)
    left join public.clients c on c.id = s.client_id
   order by occ.d, s.starts_at;
$$;

revoke execute on function public.series_clashes(timestamptz, integer, date, uuid) from public, anon;
grant execute on function public.series_clashes(timestamptz, integer, date, uuid) to authenticated;

-- ---------- 6. Packs and money: the functions ----------

-- Sells a pack to one of the signed-in trainer's clients, sold today (their day), in their
-- currency, optionally paid already (p_paid_method alone means paid today). With p_use_unpaid,
-- the client's sessions done and not paid (and charged no-shows) that aren't on a pack move onto
-- it first, oldest first; with p_use_booked, then their booked sessions that aren't on a pack or
-- paid, earliest first, as far as it goes. Moved sessions take the pack's share as their price.
-- Returns {pack_id, moved}.
create function public.sell_pack(
  p_client uuid,
  p_sessions integer,
  p_price_cents integer,
  p_expires_on date default null,
  p_paid_on date default null,
  p_paid_method text default null,
  p_note text default null,
  p_use_booked boolean default true,
  p_use_unpaid boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.coach_adding();
  tz text;
  charge boolean;
  today date;
  person uuid;
  pid uuid;
  moved integer := 0;
  n integer;
begin
  select p.time_zone, p.charge_no_shows into tz, charge from public.profiles p where p.id = me;
  today := (now() at time zone tz)::date;
  select c.user_id into person from public.clients c where c.id = p_client and c.trainer_id = me and c.status <> 'archived';
  if not found then
    raise exception 'This client can''t get a pack now.' using errcode = '22023';
  end if;
  if p_sessions is null or p_sessions not between 1 and 200 then
    raise exception 'A pack holds 1 to 200 sessions.' using errcode = '22023';
  end if;
  if p_price_cents is null or p_price_cents not between 0 and 100000000 then
    raise exception 'Enter the price of the whole pack, up to 1 000 000.' using errcode = '22023';
  end if;
  if p_price_cents > p_sessions * 10000000 then
    raise exception 'Enter a pack price up to 100 000 a session.' using errcode = '22023';
  end if;
  if p_expires_on is not null and p_expires_on not between today and today + 1100 then
    raise exception 'Pick an end date from today, within 3 years.' using errcode = '22023';
  end if;
  if p_paid_method is not null and p_paid_method not in ('cash', 'eft', 'card', 'other') then
    raise exception 'Pick how it was paid.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('pack:' || p_client::text, 0));
  insert into public.session_packs
    (trainer_id, client_id, sessions_total, price_cents, sold_on, expires_on, paid_on, paid_method, note)
  values
    (me, p_client, p_sessions, p_price_cents, today, p_expires_on,
     case when p_paid_method is not null then coalesce(p_paid_on, today) else p_paid_on end,
     p_paid_method, nullif(left(btrim(coalesce(p_note, '')), 300), ''))
  returning id into pid;
  if coalesce(p_use_unpaid, false) then
    update public.sessions s set pack_id = pid
     where s.id in (
       select x.id from public.sessions x
        where x.trainer_id = me and x.client_id = p_client and x.pack_id is null and x.paid_on is null
          and (x.status = 'completed' or (x.status = 'no_show' and charge))
          and (p_expires_on is null or (x.starts_at at time zone tz)::date <= p_expires_on)
        order by x.starts_at
        limit p_sessions);
    get diagnostics n = row_count;
    moved := moved + n;
  end if;
  if coalesce(p_use_booked, true) and moved < p_sessions then
    update public.sessions s set pack_id = pid
     where s.id in (
       select x.id from public.sessions x
        where x.trainer_id = me and x.client_id = p_client and x.pack_id is null and x.paid_on is null
          and x.status = 'scheduled'
          and (p_expires_on is null or (x.starts_at at time zone tz)::date <= p_expires_on)
        order by x.starts_at
        limit p_sessions - moved);
    get diagnostics n = row_count;
    moved := moved + n;
  end if;
  -- Voltrix shows packs with the sessions; an open app reloads them.
  perform public.send_to_inbox(person, 'session', jsonb_build_object('client_id', p_client));
  return jsonb_build_object('pack_id', pid, 'moved', moved);
end;
$$;

revoke execute on function public.sell_pack(uuid, integer, integer, date, date, text, text, boolean, boolean) from public, anon;
grant execute on function public.sell_pack(uuid, integer, integer, date, date, text, text, boolean, boolean) to authenticated;

-- Marks the signed-in trainer's sessions and packs paid on p_paid_on (with p_method), or unpaid
-- when p_paid_on is null, in one go ("Mark all paid"). Pack sessions are left out (their pack is
-- paid instead). Returns how many changed.
create function public.set_paid(p_sessions uuid[], p_packs uuid[], p_paid_on date, p_method text default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_method text := case when p_paid_on is null then null else p_method end;
  n integer;
  total integer := 0;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_method is not null and p_method not in ('cash', 'eft', 'card', 'other') then
    raise exception 'Pick how it was paid.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_sessions), 0) + coalesce(cardinality(p_packs), 0) > 500 then
    raise exception 'Mark up to 500 at a time.' using errcode = '22023';
  end if;
  update public.sessions s
     set paid_on = p_paid_on, paid_method = v_method
   where s.id = any (coalesce(p_sessions, '{}'::uuid[]))
     and s.trainer_id = me
     and s.pack_id is null
     and (s.paid_on is distinct from p_paid_on or s.paid_method is distinct from v_method);
  get diagnostics n = row_count;
  total := total + n;
  update public.session_packs k
     set paid_on = p_paid_on, paid_method = v_method
   where k.id = any (coalesce(p_packs, '{}'::uuid[]))
     and k.trainer_id = me
     and (k.paid_on is distinct from p_paid_on or k.paid_method is distinct from v_method);
  get diagnostics n = row_count;
  return total + n;
end;
$$;

revoke execute on function public.set_paid(uuid[], uuid[], date, text) from public, anon;
grant execute on function public.set_paid(uuid[], uuid[], date, text) to authenticated;

-- What one of the signed-in trainer's clients owes, item by item, oldest first: sessions done
-- (and no-shows while the trainer charges for them) with a price above 0 that aren't on a pack
-- and aren't paid, and packs with a price above 0 that aren't paid. Sessions still booked are
-- never owed. day is the session's or the sale's day on the trainer's clock.
create function public.owed_items(p_client uuid)
returns table (
  kind text,
  id uuid,
  day date,
  starts_at timestamptz,
  status text,
  sessions integer,
  cents integer,
  currency text
)
language sql
stable
set search_path = ''
as $$
  select i.kind, i.id, i.day, i.starts_at, i.status, i.sessions, i.cents, i.currency
    from (
      select 'session'::text as kind, s.id, (s.starts_at at time zone pr.time_zone)::date as day, s.starts_at, s.status,
             null::integer as sessions, s.price_cents as cents, s.currency
        from public.sessions s
        join public.profiles pr on pr.id = s.trainer_id
       where s.trainer_id = auth.uid()
         and s.client_id = p_client
         and s.pack_id is null
         and s.paid_on is null
         and s.price_cents > 0
         and (s.status = 'completed' or (s.status = 'no_show' and pr.charge_no_shows))
      union all
      select 'pack', k.id, k.sold_on, null, null, k.sessions_total::int, k.price_cents, k.currency
        from public.session_packs k
       where k.trainer_id = auth.uid()
         and k.client_id = p_client
         and k.paid_on is null
         and k.price_cents > 0
    ) i
   order by i.day, i.starts_at nulls first, i.id;
$$;

revoke execute on function public.owed_items(uuid) from public, anon;
grant execute on function public.owed_items(uuid) to authenticated;

-- The signed-in trainer's packs (one client's with p_client), newest first: size, used (done,
-- and charged no-shows), booked, left to book, money, and whether it has ended.
create function public.client_packs(p_client uuid default null)
returns table (
  id uuid,
  client_id uuid,
  sessions_total integer,
  used integer,
  booked integer,
  sessions_left integer,
  price_cents integer,
  currency text,
  sold_on date,
  expires_on date,
  ended boolean,
  paid_on date,
  paid_method text,
  note text
)
language sql
stable
set search_path = ''
as $$
  select k.id, k.client_id, k.sessions_total::int, u.used, u.booked,
         greatest(k.sessions_total - u.used - u.booked, 0), k.price_cents, k.currency, k.sold_on, k.expires_on,
         coalesce(k.expires_on < (now() at time zone p.time_zone)::date, false), k.paid_on, k.paid_method, k.note
    from public.session_packs k
    join public.profiles p on p.id = k.trainer_id
   cross join lateral (
     select (count(*) filter (where s.status = 'completed' or (s.status = 'no_show' and p.charge_no_shows)))::int as used,
            (count(*) filter (where s.status = 'scheduled'))::int as booked
       from public.sessions s
      where s.pack_id = k.id
   ) u
   where k.trainer_id = auth.uid()
     and (p_client is null or k.client_id = p_client)
   order by k.sold_on desc, k.created_at desc;
$$;

revoke execute on function public.client_packs(uuid) from public, anon;
grant execute on function public.client_packs(uuid) to authenticated;

-- The signed-in trainer's money from p_from to p_to (up to about 13 months), per currency:
--   earned_cents       sessions done (and charged no-shows) in the range: their price when not on
--                      a pack, and each pack's share for its sessions used in the range (shares
--                      are counted so a pack's sessions add up to its price exactly)
--   session_cents, pack_cents        the two parts of earned_cents; pack_sessions used in the range
--   unpriced           done (or charged no-show) sessions with a client, not on a pack, no price
--   ahead_cents        booked sessions not ended yet, not on a pack
--   received_cents     sessions (not on a pack) and packs marked paid on a day in the range
--   owed_cents         owed now, whatever the range (owed_items() for every client)
--   packs_sold, packs_sold_cents       packs sold in the range
--   expired_sessions, expired_cents    sessions left unused on packs that ended in the range
create function public.money_totals(p_from timestamptz, p_to timestamptz)
returns table (
  currency text,
  earned_cents bigint,
  session_cents bigint,
  pack_cents bigint,
  pack_sessions integer,
  unpriced integer,
  ahead_cents bigint,
  received_cents bigint,
  owed_cents bigint,
  packs_sold integer,
  packs_sold_cents bigint,
  expired_sessions integer,
  expired_cents bigint
)
language sql
stable
set search_path = ''
as $$
  with me as (
    select p.id, p.charge_no_shows as charge, p.currency as cur,
           (p_from at time zone p.time_zone)::date as from_day,
           (p_to at time zone p.time_zone)::date as to_day,
           (now() at time zone p.time_zone)::date as today
      from public.profiles p
     where p.id = auth.uid()
       and p_to > p_from
       and p_to - p_from <= interval '400 days'
  ), sess as (
    -- A session with no price has no currency yet: it counts with the trainer's.
    select coalesce(s.currency, me.cur) as currency,
           sum(s.price_cents) filter (where s.status = 'completed' or (s.status = 'no_show' and me.charge)) as cents,
           (count(*) filter (where s.price_cents is null and (s.status = 'completed' or (s.status = 'no_show' and me.charge))))::int as unpriced,
           sum(s.price_cents) filter (where s.status = 'scheduled' and s.starts_at + make_interval(mins => s.duration_minutes) > now()) as ahead
      from public.sessions s, me
     where s.trainer_id = me.id
       and s.client_id is not null
       and s.pack_id is null
       and s.starts_at >= p_from
       and s.starts_at < p_to
     group by 1
  ), pack_use as (
    -- Per pack: its sessions used before the range and up to its end. The k-th session used earns
    -- round(price * k / n) - round(price * (k - 1) / n), so the shares add up to the price.
    select k.currency, k.price_cents::numeric as price, k.sessions_total::numeric as total,
           least(count(*) filter (where s.starts_at < p_from), k.sessions_total) as used_before,
           least(count(*) filter (where s.starts_at < p_to), k.sessions_total) as used_upto
      from public.session_packs k
      join public.sessions s on s.pack_id = k.id
     cross join me
     where k.trainer_id = me.id
       and (s.status = 'completed' or (s.status = 'no_show' and me.charge))
     group by k.id
  ), packs as (
    select u.currency,
           sum(round(u.price * u.used_upto / u.total) - round(u.price * u.used_before / u.total))::bigint as cents,
           sum(u.used_upto - u.used_before)::int as used
      from pack_use u
     group by u.currency
  ), sold as (
    select k.currency, count(*)::int as n, sum(k.price_cents)::bigint as cents
      from public.session_packs k, me
     where k.trainer_id = me.id and k.sold_on >= me.from_day and k.sold_on < me.to_day
     group by k.currency
  ), expired as (
    select k.currency,
           sum(k.sessions_total - least(k.sessions_total, u.used))::int as n,
           sum(k.price_cents - round(k.price_cents::numeric * least(k.sessions_total, u.used) / k.sessions_total))::bigint as cents
      from public.session_packs k
     cross join me
     cross join lateral (
       select count(*) as used from public.sessions s
        where s.pack_id = k.id and (s.status = 'completed' or (s.status = 'no_show' and me.charge))
     ) u
     where k.trainer_id = me.id
       and k.expires_on >= me.from_day and k.expires_on < me.to_day and k.expires_on < me.today
     group by k.currency
  ), received as (
    select x.currency, sum(x.cents)::bigint as cents
      from (
        select s.currency, s.price_cents as cents
          from public.sessions s, me
         where s.trainer_id = me.id and s.pack_id is null and s.price_cents is not null
           and s.paid_on >= me.from_day and s.paid_on < me.to_day
        union all
        select k.currency, k.price_cents
          from public.session_packs k, me
         where k.trainer_id = me.id and k.paid_on >= me.from_day and k.paid_on < me.to_day
      ) x
     group by x.currency
  ), owed as (
    select x.currency, sum(x.cents)::bigint as cents
      from (
        select s.currency, s.price_cents as cents
          from public.sessions s, me
         where s.trainer_id = me.id and s.client_id is not null and s.pack_id is null and s.paid_on is null
           and s.price_cents > 0
           and (s.status = 'completed' or (s.status = 'no_show' and me.charge))
        union all
        select k.currency, k.price_cents
          from public.session_packs k, me
         where k.trainer_id = me.id and k.paid_on is null and k.price_cents > 0
      ) x
     group by x.currency
  ), currencies as (
    select sess.currency from sess
    union select packs.currency from packs
    union select sold.currency from sold
    union select expired.currency from expired
    union select received.currency from received
    union select owed.currency from owed
  )
  select c.currency,
         (coalesce(sess.cents, 0) + coalesce(packs.cents, 0))::bigint,
         coalesce(sess.cents, 0)::bigint,
         coalesce(packs.cents, 0)::bigint,
         coalesce(packs.used, 0),
         coalesce(sess.unpriced, 0),
         coalesce(sess.ahead, 0)::bigint,
         coalesce(received.cents, 0),
         coalesce(owed.cents, 0),
         coalesce(sold.n, 0), coalesce(sold.cents, 0),
         coalesce(expired.n, 0), coalesce(expired.cents, 0)
    from currencies c
    left join sess on sess.currency = c.currency
    left join packs on packs.currency = c.currency
    left join sold on sold.currency = c.currency
    left join expired on expired.currency = c.currency
    left join received on received.currency = c.currency
    left join owed on owed.currency = c.currency
   where c.currency is not null
   order by c.currency;
$$;

revoke execute on function public.money_totals(timestamptz, timestamptz) from public, anon;
grant execute on function public.money_totals(timestamptz, timestamptz) to authenticated;

-- ---------- 7. Clients book open times ----------

-- Weekly hours as [{"day": 1-7 (Monday is 1), "from": "HH:MM", "to": "HH:MM"}], the trainer's
-- clock, 5-minute steps, "to" up to "24:00", nothing else in each entry, up to 42 entries.
-- Ranges on one day that overlap or touch count as one.
create function public.booking_hours_ok(p_hours jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 42 then
    return false;
  end if;
  for e in select x from jsonb_array_elements(p_hours) x loop
    if jsonb_typeof(e) <> 'object'
       or exists (select 1 from jsonb_object_keys(e) k where k not in ('day', 'from', 'to'))
       or coalesce(jsonb_typeof(e -> 'day'), '') <> 'number'
       or coalesce(e ->> 'day', '') !~ '^[1-7]$'
       or coalesce(jsonb_typeof(e -> 'from'), '') <> 'string'
       or coalesce(jsonb_typeof(e -> 'to'), '') <> 'string'
       or (e ->> 'from') !~ '^([01][0-9]|2[0-3]):[0-5][05]$'
       or (e ->> 'to') !~ '^(([01][0-9]|2[0-3]):[0-5][05]|24:00)$'
       or (e ->> 'to') <= (e ->> 'from') then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke execute on function public.booking_hours_ok(jsonb) from public, anon;
grant execute on function public.booking_hours_ok(jsonb) to authenticated;

-- One weekday's hours as minutes from midnight, overlapping or touching ranges joined.
create function public.hours_on(p_hours jsonb, p_weekday integer)
returns setof int4range
language sql
immutable
set search_path = ''
as $$
  select r
    from unnest((
      select range_agg(int4range(
               split_part(e ->> 'from', ':', 1)::int * 60 + split_part(e ->> 'from', ':', 2)::int,
               split_part(e ->> 'to', ':', 1)::int * 60 + split_part(e ->> 'to', ':', 2)::int))
        from jsonb_array_elements(p_hours) e
       where (e ->> 'day')::int = p_weekday
    )) r;
$$;

revoke execute on function public.hours_on(jsonb, integer) from public, anon, authenticated;

-- A trainer's rules for clients booking themselves. Times are on the trainer's clock (time_zone).
--   enabled          clients can book in Voltrix (off until the trainer turns it on)
--   mode             'approve': a request the trainer answers; 'auto': booked straight away
--   hours            the weekly hours open for booking
--   lengths          session lengths a client can pick
--   notice_minutes   how soon a client can book (from now)
--   horizon_days     how far ahead (days after today)
--   cancel_minutes   a client can cancel in Voltrix until this long before; null: never
--   step_minutes     start times every 15, 30 or 60 minutes from the start of each range
--   buffer_minutes   a gap kept free before and after other sessions
--   max_ahead        sessions (and requests) a client may hold that they booked themselves
--   location         where sessions booked this way take place
create table public.booking_rules (
  trainer_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'approve'
    constraint booking_rules_mode_check check (mode in ('approve', 'auto')),
  hours jsonb not null default '[]'
    constraint booking_rules_hours_check check (public.booking_hours_ok(hours)),
  lengths smallint[] not null default '{60}'
    constraint booking_rules_lengths_check
      check (lengths <@ '{30,45,60,90,120}'::smallint[] and cardinality(lengths) between 1 and 5),
  notice_minutes integer not null default 720
    constraint booking_rules_notice_check check (notice_minutes between 0 and 10080),
  horizon_days smallint not null default 28
    constraint booking_rules_horizon_check check (horizon_days between 1 and 90),
  cancel_minutes integer default 1440
    constraint booking_rules_cancel_check check (cancel_minutes is null or cancel_minutes between 0 and 10080),
  step_minutes smallint not null default 30
    constraint booking_rules_step_check check (step_minutes in (15, 30, 60)),
  buffer_minutes smallint not null default 0
    constraint booking_rules_buffer_check check (buffer_minutes between 0 and 60),
  max_ahead smallint not null default 4
    constraint booking_rules_max_ahead_check check (max_ahead between 1 and 20),
  location text
    constraint booking_rules_location_check check (location is null or char_length(location) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger booking_rules_set_updated_at before update on public.booking_rules
  for each row execute function public.set_updated_at();

alter table public.booking_rules enable row level security;
revoke all on public.booking_rules from anon, authenticated;
grant select on public.booking_rules to authenticated;
grant insert (enabled, mode, hours, lengths, notice_minutes, horizon_days, cancel_minutes, step_minutes, buffer_minutes,
              max_ahead, location),
  update (enabled, mode, hours, lengths, notice_minutes, horizon_days, cancel_minutes, step_minutes, buffer_minutes,
          max_ahead, location)
  on public.booking_rules to authenticated;

create policy booking_rules_select_own on public.booking_rules
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy booking_rules_insert_own on public.booking_rules
  for insert to authenticated
  with check (trainer_id = (select auth.uid()) and (select public.is_trainer()));
create policy booking_rules_update_own on public.booking_rules
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));

-- A time a client asked for, when the trainer approves bookings first. It holds the time until
-- it is answered or withdrawn, or the time passes (then it has expired). Approving makes the
-- session (session_id). Made and answered only by the functions below; the trainer and the
-- person read their own.
create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null
    constraint booking_requests_duration_check check (duration_minutes between 5 and 600),
  note text
    constraint booking_requests_note_check check (note is null or char_length(note) <= 300),
  status text not null default 'pending'
    constraint booking_requests_status_check check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  session_id uuid references public.sessions (id) on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index booking_requests_pending_idx on public.booking_requests (trainer_id, starts_at) where status = 'pending';
create index booking_requests_trainer_idx on public.booking_requests (trainer_id, created_at);
create index booking_requests_client_idx on public.booking_requests (client_id);
create index booking_requests_user_idx on public.booking_requests (user_id, created_at);
create index booking_requests_session_idx on public.booking_requests (session_id) where session_id is not null;

alter table public.booking_requests enable row level security;
revoke all on public.booking_requests from anon, authenticated;
grant select on public.booking_requests to authenticated;

create policy booking_requests_select_own on public.booking_requests
  for select to authenticated
  using (trainer_id = (select auth.uid()) or user_id = (select auth.uid()));

-- Is the trainer busy from p_start for p_minutes, keeping p_buffer minutes free on each side?
-- Busy: any session that isn't cancelled (time blocked off too), a request still waiting (but
-- p_ignore), and the weeks a repeat hasn't made yet (its client not archived).
create function public.slot_busy(p_trainer uuid, p_start timestamptz, p_minutes integer, p_buffer integer, p_ignore uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
           select 1 from public.sessions s
            where s.trainer_id = p_trainer
              and s.status <> 'cancelled'
              and s.starts_at > p_start - interval '11 hours'
              and s.starts_at < p_start + make_interval(mins => p_minutes + p_buffer)
              and s.starts_at + make_interval(mins => s.duration_minutes + p_buffer) > p_start
         )
      or exists (
           select 1 from public.booking_requests q
            where q.trainer_id = p_trainer
              and q.status = 'pending'
              and q.starts_at > now()
              and (p_ignore is null or q.id <> p_ignore)
              and q.starts_at < p_start + make_interval(mins => p_minutes + p_buffer)
              and q.starts_at + make_interval(mins => q.duration_minutes + p_buffer) > p_start
         )
      or exists (
           select 1
             from public.session_series ss
             left join public.clients c on c.id = ss.client_id
            cross join lateral (
              select (p_start at time zone ss.time_zone)::date + k as d from generate_series(-1, 1) k
            ) dd
            where ss.trainer_id = p_trainer
              and (c.id is null or c.status <> 'archived')
              and extract(isodow from dd.d) = ss.weekday
              and dd.d > ss.made_until
              and dd.d >= ss.starts_on
              and (ss.ends_on is null or dd.d <= ss.ends_on)
              and ((dd.d + ss.start_time) at time zone ss.time_zone) < p_start + make_interval(mins => p_minutes + p_buffer)
              and ((dd.d + ss.start_time) at time zone ss.time_zone)
                  + make_interval(mins => ss.duration_minutes + p_buffer) > p_start
         );
$$;

revoke execute on function public.slot_busy(uuid, timestamptz, integer, integer, uuid) from public, anon, authenticated;

-- Is p_start, for p_minutes, inside the trainer's hours on that day, on one of the start times?
create function public.slot_in_hours(p_hours jsonb, p_step integer, p_tz text, p_start timestamptz, p_minutes integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.hours_on(p_hours, extract(isodow from (p_start at time zone p_tz))::int) r,
           lateral (select extract(hour from (p_start at time zone p_tz))::int * 60
                           + extract(minute from (p_start at time zone p_tz))::int as m) x
     where extract(second from (p_start at time zone p_tz)) = 0
       and x.m >= lower(r)
       and x.m + p_minutes <= upper(r)
       and (x.m - lower(r)) % p_step = 0
  );
$$;

revoke execute on function public.slot_in_hours(jsonb, integer, text, timestamptz, integer) from public, anon, authenticated;

-- The signed-in person's client row with this trainer when they may book themselves now (linked,
-- active, allowed by the trainer, booking on, the trainer's plan active), else a sentence that
-- says why not.
create function public.self_booker(p_trainer uuid)
returns public.clients
language plpgsql
stable
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cl public.clients;
  r public.booking_rules;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into cl from public.clients c
   where c.trainer_id = p_trainer and c.user_id = me and c.status <> 'archived'
   order by c.created_at
   limit 1;
  if cl.id is null then
    raise exception 'You can book with your own trainer only.' using errcode = '22023';
  end if;
  if cl.status = 'paused' then
    raise exception 'Your trainer has paused your sessions. Message them to book.' using errcode = '22023';
  end if;
  select * into r from public.booking_rules b where b.trainer_id = p_trainer;
  if r.trainer_id is null or not r.enabled or not cl.self_booking then
    raise exception 'Your trainer doesn''t take bookings in the app. Message them to book.' using errcode = '22023';
  end if;
  if not public.coach_access_of(p_trainer) then
    raise exception 'Your trainer can''t take bookings in the app right now. Message them to book.' using errcode = '22023';
  end if;
  return cl;
end;
$$;

revoke execute on function public.self_booker(uuid) from public, anon, authenticated;

-- A trainer's open start times from p_from (their day) for p_days days (1 to 31), for a session of
-- p_minutes (one of their lengths): inside their hours, on the start-time steps, after the notice,
-- within how far ahead, and free with the gap either side. Nothing about who else is booked.
create function public.slots_for(p_trainer uuid, p_from date, p_days integer, p_minutes integer)
returns table (starts_at timestamptz, local_day date, local_time text)
language plpgsql
stable
set search_path = ''
as $$
declare
  r public.booking_rules;
  tz text;
  today date;
begin
  select * into r from public.booking_rules b where b.trainer_id = p_trainer;
  select p.time_zone into tz from public.profiles p where p.id = p_trainer;
  if r.trainer_id is null or tz is null or p_from is null or p_days is null or p_days not between 1 and 31
     or p_minutes is null or not (p_minutes = any (r.lengths)) then
    return;
  end if;
  today := (now() at time zone tz)::date;
  return query
    with days as (
      select d::date as d
        from generate_series(greatest(p_from, today), least(p_from + p_days - 1, today + r.horizon_days), interval '1 day') d
    ), ranges as (
      select days.d, lower(x) as f, upper(x) as t
        from days
       cross join lateral public.hours_on(r.hours, extract(isodow from days.d)::int) x
    ), starts as (
      select ranges.d, m
        from ranges
       cross join lateral generate_series(ranges.f, ranges.t - p_minutes, r.step_minutes::int) m
    )
    select ((st.d + make_interval(mins => st.m)) at time zone tz),
           st.d,
           to_char(make_time(st.m / 60, st.m % 60, 0), 'HH24:MI')
      from starts st
     where ((st.d + make_interval(mins => st.m)) at time zone tz) >= now() + make_interval(mins => r.notice_minutes)
       and not public.slot_busy(p_trainer, ((st.d + make_interval(mins => st.m)) at time zone tz), p_minutes,
                                r.buffer_minutes, null)
     order by 1;
end;
$$;

revoke execute on function public.slots_for(uuid, date, integer, integer) from public, anon, authenticated;

-- What the Book screen needs about one of the signed-in person's trainers, as one value. When the
-- person can't book, can_book is false and reason says why: 'not_linked', 'paused', 'off' (the
-- trainer doesn't take bookings in the app, or not from this client) or 'lapsed'.
create function public.booking_info(p_trainer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cl public.clients;
  r public.booking_rules;
  p public.profiles;
  reason text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into cl from public.clients c
   where c.trainer_id = p_trainer and c.user_id = me and c.status <> 'archived'
   order by c.created_at
   limit 1;
  if cl.id is null then
    return jsonb_build_object('can_book', false, 'reason', 'not_linked');
  end if;
  select * into r from public.booking_rules b where b.trainer_id = p_trainer;
  select * into p from public.profiles x where x.id = p_trainer;
  reason := case
              when cl.status = 'paused' then 'paused'
              when r.trainer_id is null or not r.enabled or not cl.self_booking then 'off'
              when not public.coach_access_of(p_trainer) then 'lapsed'
            end;
  return jsonb_build_object(
    'can_book', reason is null,
    'reason', reason,
    'client_id', cl.id,
    'trainer_id', p_trainer,
    'trainer_name', p.full_name,
    'business_name', p.business_name,
    'trainer_avatar', p.avatar_url,
    'time_zone', p.time_zone,
    'today', (now() at time zone p.time_zone)::date,
    'mode', case when reason is null then r.mode end,
    'lengths', case when reason is null then to_jsonb(r.lengths) end,
    'notice_minutes', case when reason is null then r.notice_minutes end,
    'horizon_days', case when reason is null then r.horizon_days end,
    'cancel_minutes', case when reason is null then r.cancel_minutes end,
    'step_minutes', case when reason is null then r.step_minutes end,
    'max_ahead', case when reason is null then r.max_ahead end,
    'location', case when reason is null then r.location end
  );
end;
$$;

revoke execute on function public.booking_info(uuid) from public, anon;
grant execute on function public.booking_info(uuid) to authenticated;

-- The open start times with one of the signed-in person's trainers (slots_for()), each with its
-- day and time on the trainer's clock. Nothing when the person can't book.
create function public.open_slots(p_trainer uuid, p_from date, p_days integer, p_minutes integer)
returns table (starts_at timestamptz, local_day date, local_time text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  begin
    perform public.self_booker(p_trainer);
  exception when sqlstate '22023' then
    return;
  end;
  return query select * from public.slots_for(p_trainer, p_from, p_days, p_minutes);
end;
$$;

revoke execute on function public.open_slots(uuid, date, integer, integer) from public, anon;
grant execute on function public.open_slots(uuid, date, integer, integer) to authenticated;

-- What the signed-in trainer's clients would see, whether booking is on or not (the preview in
-- Settings). p_minutes null: the first length.
create function public.booking_preview(p_from date, p_days integer, p_minutes integer default null)
returns table (starts_at timestamptz, local_day date, local_time text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  len integer;
begin
  if auth.uid() is null or not public.is_trainer() then
    return;
  end if;
  select coalesce(p_minutes, b.lengths[1]) into len from public.booking_rules b where b.trainer_id = auth.uid();
  return query select * from public.slots_for(auth.uid(), p_from, p_days, len);
end;
$$;

revoke execute on function public.booking_preview(date, integer, integer) from public, anon;
grant execute on function public.booking_preview(date, integer, integer) to authenticated;

-- Books an open time with one of the signed-in person's trainers. One booking per trainer at a
-- time (a lock), then the time is checked again, so two people can never take the same time.
-- Straight away: makes the session (on the client's pack when one has room) and answers
-- {"kind": "booked", "session_id", "starts_at"}. Approve first: answers {"kind": "requested",
-- "request_id", "starts_at"}. The trainer gets news either way. p_note (up to 300) is for the
-- trainer. Limits: the trainer's max_ahead for what the person booked themselves and hasn't had
-- yet (requests waiting count), and 10 bookings or requests a day.
create function public.book_slot(p_trainer uuid, p_starts_at timestamptz, p_minutes integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  cl public.clients := public.self_booker(p_trainer);
  r public.booking_rules;
  tz text;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
  who text;
  ahead integer;
  today_count integer;
  made uuid;
begin
  select * into r from public.booking_rules b where b.trainer_id = p_trainer;
  select p.time_zone into tz from public.profiles p where p.id = p_trainer;
  if p_minutes is null or not (p_minutes = any (r.lengths)) then
    raise exception 'Pick one of the session lengths your trainer offers.' using errcode = '22023';
  end if;
  if p_starts_at is null then
    raise exception 'Pick a time.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('book:' || p_trainer::text, 0));
  if p_starts_at < now() + make_interval(mins => r.notice_minutes) then
    raise exception 'That time is too soon to book. Pick a later time.' using errcode = '22023';
  end if;
  if (p_starts_at at time zone tz)::date > (now() at time zone tz)::date + r.horizon_days then
    raise exception 'That day is too far ahead to book. Pick an earlier day.' using errcode = '22023';
  end if;
  if not public.slot_in_hours(r.hours, r.step_minutes, tz, p_starts_at, p_minutes) then
    raise exception 'That time isn''t open for booking. Pick another time.' using errcode = '22023';
  end if;
  if public.slot_busy(p_trainer, p_starts_at, p_minutes, r.buffer_minutes, null) then
    raise exception 'That time was just taken. Pick another time.' using errcode = '22023';
  end if;
  select (select count(*) from public.sessions s
           where s.client_id = cl.id and s.booked_by = me and s.status = 'scheduled' and s.starts_at > now())
       + (select count(*) from public.booking_requests q
           where q.client_id = cl.id and q.user_id = me and q.status = 'pending' and q.starts_at > now())
    into ahead;
  if ahead >= r.max_ahead then
    raise exception 'You have % sessions booked already. Book more after the next one.', ahead using errcode = '22023';
  end if;
  -- A request the trainer approved counts once (its session isn't counted again).
  select (select count(*) from public.sessions s
           where s.booked_by = me and s.created_at > now() - interval '1 day'
             and not exists (select 1 from public.booking_requests q where q.session_id = s.id))
       + (select count(*) from public.booking_requests q where q.user_id = me and q.created_at > now() - interval '1 day')
    into today_count;
  if today_count >= 10 then
    raise exception 'You''ve booked a lot today. Try again tomorrow.' using errcode = '22023';
  end if;
  who := cl.first_name || coalesce(' ' || nullif(btrim(cl.last_name), ''), '');
  if r.mode = 'approve' then
    insert into public.booking_requests (trainer_id, client_id, user_id, starts_at, duration_minutes, note)
    values (p_trainer, cl.id, me, p_starts_at, p_minutes, v_note)
    returning id into made;
    perform public.tell(p_trainer, 'requested', cl.id,
      jsonb_build_object('request_id', made, 'starts_at', p_starts_at, 'minutes', p_minutes, 'name', who));
    return jsonb_build_object('kind', 'requested', 'request_id', made, 'starts_at', p_starts_at);
  end if;
  insert into public.sessions (trainer_id, client_id, starts_at, duration_minutes, location, client_note, booked_by)
  values (p_trainer, cl.id, p_starts_at, p_minutes, r.location, v_note, me)
  returning id into made;
  perform public.tell(p_trainer, 'booked', cl.id,
    jsonb_build_object('session_id', made, 'starts_at', p_starts_at, 'minutes', p_minutes, 'name', who));
  return jsonb_build_object('kind', 'booked', 'session_id', made, 'starts_at', p_starts_at);
end;
$$;

revoke execute on function public.book_slot(uuid, timestamptz, integer, text) from public, anon;
grant execute on function public.book_slot(uuid, timestamptz, integer, text) to authenticated;

-- The signed-in trainer's booking requests: those waiting (their time not passed) and those
-- answered, withdrawn or expired in the last 14 days, waiting first. clashes: something else is
-- at that time now (a session, another request, a repeat's week), so approving needs a yes.
create function public.booking_requests_for_me()
returns table (
  id uuid,
  client_id uuid,
  first_name text,
  last_name text,
  starts_at timestamptz,
  duration_minutes integer,
  note text,
  status text,
  created_at timestamptz,
  answered_at timestamptz,
  session_id uuid,
  clashes boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.client_id, c.first_name, c.last_name, q.starts_at, q.duration_minutes, q.note,
         case when q.status = 'pending' and q.starts_at <= now() then 'expired' else q.status end,
         q.created_at, q.answered_at, q.session_id,
         q.status = 'pending' and q.starts_at > now()
           and public.slot_busy(q.trainer_id, q.starts_at, q.duration_minutes, coalesce(r.buffer_minutes, 0), q.id)
    from public.booking_requests q
    join public.clients c on c.id = q.client_id
    left join public.booking_rules r on r.trainer_id = q.trainer_id
   where auth.uid() is not null
     and q.trainer_id = auth.uid()
     and ((q.status = 'pending' and q.starts_at > now() - interval '14 days') or q.answered_at > now() - interval '14 days')
   order by (q.status = 'pending' and q.starts_at > now()) desc, q.starts_at
   limit 100;
$$;

revoke execute on function public.booking_requests_for_me() from public, anon;
grant execute on function public.booking_requests_for_me() to authenticated;

-- The trainer answers a booking request. Approve (needs an active plan): makes the session (on
-- the client's pack when one has room) and answers its id; refused with hint 'busy' when the
-- trainer has something else at that time now, unless p_even_if_busy. Decline: answers null.
-- The person gets news. Answering the same way twice answers the same again.
create function public.answer_booking(p_request uuid, p_approve boolean, p_even_if_busy boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q public.booking_requests;
  r public.booking_rules;
  made uuid;
  tname text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into q from public.booking_requests x where x.id = p_request and x.trainer_id = me for update;
  if q.id is null then
    raise exception 'This request is no longer available.' using errcode = '22023';
  end if;
  if q.status = 'approved' and coalesce(p_approve, false) then
    return q.session_id;
  elsif q.status = 'declined' and not coalesce(p_approve, false) then
    return null;
  elsif q.status = 'withdrawn' then
    raise exception 'The client withdrew this request.' using errcode = '22023';
  elsif q.status <> 'pending' then
    raise exception 'You''ve answered this request already.' using errcode = '22023';
  end if;
  if coalesce(p_approve, false) then
    perform public.coach_adding();
    if q.starts_at <= now() then
      raise exception 'This request has expired: its time has passed.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.clients c where c.id = q.client_id and c.trainer_id = me and c.status <> 'archived') then
      raise exception 'This client is archived. Restore them first.' using errcode = '22023';
    end if;
    select * into r from public.booking_rules b where b.trainer_id = me;
    perform pg_advisory_xact_lock(hashtextextended('book:' || me::text, 0));
    if not coalesce(p_even_if_busy, false)
       and public.slot_busy(me, q.starts_at, q.duration_minutes, coalesce(r.buffer_minutes, 0), q.id) then
      raise exception 'You have something else at that time now.' using errcode = '22023', hint = 'busy';
    end if;
    insert into public.sessions (trainer_id, client_id, starts_at, duration_minutes, location, client_note, booked_by)
    values (me, q.client_id, q.starts_at, q.duration_minutes, r.location, q.note, q.user_id)
    returning id into made;
    update public.booking_requests x set status = 'approved', answered_at = now(), session_id = made where x.id = q.id;
  else
    update public.booking_requests x set status = 'declined', answered_at = now() where x.id = q.id;
  end if;
  perform public.news_settled(me, 'requested', q.id, false);
  select coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), p.business_name) into tname
    from public.profiles p where p.id = me;
  perform public.tell(q.user_id, 'booking_answered', q.client_id,
    jsonb_build_object('request_id', q.id, 'approved', coalesce(p_approve, false), 'starts_at', q.starts_at,
                       'minutes', q.duration_minutes, 'trainer_id', me, 'trainer_name', tname, 'session_id', made));
  return made;
end;
$$;

revoke execute on function public.answer_booking(uuid, boolean, boolean) from public, anon;
grant execute on function public.answer_booking(uuid, boolean, boolean) to authenticated;

-- The person withdraws a request still waiting. True when it was withdrawn now.
create function public.withdraw_booking(p_request uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q public.booking_requests;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.booking_requests x
     set status = 'withdrawn', answered_at = now()
   where x.id = p_request and x.user_id = me and x.status = 'pending'
  returning x.* into q;
  if q.id is null then
    return false;
  end if;
  perform public.news_settled(q.trainer_id, 'requested', q.id, true);
  return true;
end;
$$;

revoke execute on function public.withdraw_booking(uuid) from public, anon;
grant execute on function public.withdraw_booking(uuid) to authenticated;

-- The person cancels one of their booked sessions in Voltrix, when their trainer allows it (booking
-- on, this client allowed, a cancel time set) and it isn't too late (cancel_minutes before the
-- start). True when cancelled now; false when it was cancelled already. The trainer gets news
-- (with whether it was paid); the session shows who cancelled it (cancelled_by).
create function public.cancel_my_session(p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  s public.sessions;
  cl public.clients;
  r public.booking_rules;
  who text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select x.* into s
    from public.sessions x
   where x.id = p_session
     and exists (select 1 from public.clients c where c.id = x.client_id and c.user_id = me and c.status <> 'archived')
     for update;
  if s.id is null then
    raise exception 'This session is no longer available.' using errcode = '22023';
  end if;
  if s.status = 'cancelled' then
    return false;
  end if;
  select c.* into cl from public.clients c where c.id = s.client_id;
  select coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), p.business_name, 'your trainer') into who
    from public.profiles p where p.id = s.trainer_id;
  if s.status <> 'scheduled' then
    raise exception 'This session has been marked already.' using errcode = '22023';
  end if;
  select * into r from public.booking_rules b where b.trainer_id = s.trainer_id;
  if r.trainer_id is null or not r.enabled or not cl.self_booking or cl.status <> 'active' or r.cancel_minutes is null then
    raise exception 'Message % to cancel.', who using errcode = '22023';
  end if;
  if now() > s.starts_at - make_interval(mins => r.cancel_minutes) then
    raise exception 'It''s too late to cancel in the app. Message % instead.', who using errcode = '22023';
  end if;
  update public.sessions x set status = 'cancelled', cancelled_by = me where x.id = s.id;
  perform public.tell(s.trainer_id, 'cancelled', cl.id,
    jsonb_build_object('session_id', s.id, 'starts_at', s.starts_at, 'minutes', s.duration_minutes,
                       'name', cl.first_name || coalesce(' ' || nullif(btrim(cl.last_name), ''), ''),
                       'paid', s.paid_on is not null, 'on_pack', s.pack_id is not null));
  return true;
end;
$$;

revoke execute on function public.cancel_my_session(uuid) from public, anon;
grant execute on function public.cancel_my_session(uuid) to authenticated;

-- Like my_sessions_v2(), plus: trainer_id, repeats (from a weekly booking), booked_by_me,
-- cancelled_by_me, on_pack (paid for with a pack; never for a cancelled one), and cancel_until
-- (until when the person may cancel it in Voltrix; null: they can't; a time in the past: no
-- longer). Still no prices or notes.
-- my_sessions_v2() stays for app versions already on phones.
create function public.my_sessions_v3(range_start timestamptz, range_end timestamptz)
returns table (
  id uuid,
  starts_at timestamptz,
  duration_minutes integer,
  location text,
  status text,
  trainer_name text,
  business_name text,
  online boolean,
  client_id uuid,
  trainer_avatar text,
  trainer_id uuid,
  repeats boolean,
  booked_by_me boolean,
  cancelled_by_me boolean,
  on_pack boolean,
  cancel_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.duration_minutes, s.location, s.status, p.full_name, p.business_name,
         s.online, c.id, p.avatar_url, s.trainer_id,
         s.series_id is not null,
         coalesce(s.booked_by = auth.uid(), false),
         coalesce(s.status = 'cancelled' and s.cancelled_by = auth.uid(), false),
         s.pack_id is not null and s.status <> 'cancelled',
         case when s.status = 'scheduled' and r.enabled and c.self_booking and c.status = 'active'
                   and r.cancel_minutes is not null
              then s.starts_at - make_interval(mins => r.cancel_minutes) end
    from public.sessions s
    join public.clients c on c.id = s.client_id
    join public.profiles p on p.id = s.trainer_id
    left join public.booking_rules r on r.trainer_id = s.trainer_id
   where c.user_id = auth.uid()
     and c.status <> 'archived'
     and s.starts_at >= range_start
     and s.starts_at < range_end
     and range_end - range_start <= interval '400 days'
   order by s.starts_at;
$$;

revoke execute on function public.my_sessions_v3(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_sessions_v3(timestamptz, timestamptz) to authenticated;

-- The signed-in person's booking requests: those still waiting (or expired in the last day) and
-- those answered or withdrawn in the last 14 days, newest first, with the trainer's name.
create function public.my_booking_requests()
returns table (
  id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  trainer_avatar text,
  client_id uuid,
  starts_at timestamptz,
  duration_minutes integer,
  note text,
  status text,
  session_id uuid,
  created_at timestamptz,
  answered_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.trainer_id, p.full_name, p.business_name, p.avatar_url, q.client_id, q.starts_at,
         q.duration_minutes, q.note,
         case when q.status = 'pending' and q.starts_at <= now() then 'expired' else q.status end,
         q.session_id, q.created_at, q.answered_at
    from public.booking_requests q
    join public.profiles p on p.id = q.trainer_id
   where q.user_id = auth.uid()
     and ((q.status = 'pending' and q.starts_at > now() - interval '1 day') or q.answered_at > now() - interval '14 days')
   order by q.created_at desc
   limit 50;
$$;

revoke execute on function public.my_booking_requests() from public, anon;
grant execute on function public.my_booking_requests() to authenticated;

-- The signed-in person's packs with their trainers (never the price or whether it is paid): size,
-- used, booked and left, for packs still running or ended in the last 14 days.
create function public.my_packs()
returns table (
  id uuid,
  client_id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  sessions_total integer,
  used integer,
  booked integer,
  sessions_left integer,
  sold_on date,
  expires_on date,
  ended boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.client_id, k.trainer_id, p.full_name, p.business_name, k.sessions_total::int, u.used, u.booked,
         greatest(k.sessions_total - u.used - u.booked, 0), k.sold_on, k.expires_on,
         coalesce(k.expires_on < (now() at time zone p.time_zone)::date, false)
    from public.session_packs k
    join public.clients c on c.id = k.client_id
    join public.profiles p on p.id = k.trainer_id
   cross join lateral (
     select (count(*) filter (where s.status = 'completed' or (s.status = 'no_show' and p.charge_no_shows)))::int as used,
            (count(*) filter (where s.status = 'scheduled'))::int as booked
       from public.sessions s
      where s.pack_id = k.id
   ) u
   where c.user_id = auth.uid()
     and c.status <> 'archived'
     and (k.expires_on is null or k.expires_on >= (now() at time zone p.time_zone)::date - 14)
   order by k.sold_on, k.created_at;
$$;

revoke execute on function public.my_packs() from public, anon;
grant execute on function public.my_packs() to authenticated;

-- ---------- 8. Asking a trainer from the Trainers list ----------

-- Someone without a trainer asks one to train them. They saw what the trainer would see and
-- agreed (consented_at) before sending, because accepting links them without another step. One
-- request waiting per person at a time; one waiting more than 14 days has expired. note and
-- phone (optional) are what they chose to tell the trainer. Made and answered only by the
-- functions below; the person reads their own.
create table public.training_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  note text
    constraint training_requests_note_check check (note is null or char_length(note) <= 300),
  phone text
    constraint training_requests_phone_check check (phone is null or char_length(phone) <= 30),
  status text not null default 'pending'
    constraint training_requests_status_check check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),
  -- The client row the trainer's acceptance linked.
  client_id uuid references public.clients (id) on delete set null,
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  constraint training_requests_self_check check (user_id <> trainer_id)
);

create unique index training_requests_one_pending_idx on public.training_requests (user_id) where status = 'pending';
create index training_requests_user_idx on public.training_requests (user_id, created_at);
create index training_requests_trainer_idx on public.training_requests (trainer_id, status, created_at);
create index training_requests_client_idx on public.training_requests (client_id) where client_id is not null;

alter table public.training_requests enable row level security;
revoke all on public.training_requests from anon, authenticated;
grant select on public.training_requests to authenticated;

create policy training_requests_select_own on public.training_requests
  for select to authenticated using (user_id = (select auth.uid()));

-- Why the signed-in person can't ask this trainer now, or null when they can:
--   unconfirmed  their email isn't confirmed      self         it's their own profile
--   unavailable  not in the Trainers list now, or either has blocked the other
--   not_taking   not taking new clients, or 30 requests are waiting for them already
--   has_trainer  they have a trainer (paused counts)
--   waiting      a request of theirs is waiting  declined     this trainer said no in the last 30 days
--   limit        3 requests in the last 24 hours
create function public.training_request_check(p_trainer uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when not exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
             then 'unconfirmed'
           when p_trainer = auth.uid() then 'self'
           when not exists (
                  select 1 from public.profiles p
                   where p.id = p_trainer and p.role = 'trainer' and p.business_name is not null
                     and public.coach_access_of(p.id))
                or exists (
                  select 1 from public.user_blocks b
                   where (b.blocker_id = auth.uid() and b.blocked_id = p_trainer)
                      or (b.blocker_id = p_trainer and b.blocked_id = auth.uid())) then 'unavailable'
           when not (select p.accepting_clients from public.profiles p where p.id = p_trainer)
                or (select count(*) from public.training_requests q
                     where q.trainer_id = p_trainer and q.status = 'pending'
                       and q.created_at > now() - interval '14 days') >= 30 then 'not_taking'
           when exists (select 1 from public.clients c where c.user_id = auth.uid() and c.status <> 'archived')
             then 'has_trainer'
           when exists (select 1 from public.training_requests q
                         where q.user_id = auth.uid() and q.status = 'pending'
                           and q.created_at > now() - interval '14 days') then 'waiting'
           when exists (
                  select 1 from public.training_requests q
                   where q.user_id = auth.uid() and q.trainer_id = p_trainer and q.status = 'declined'
                     and q.answered_at > now() - interval '30 days') then 'declined'
           when (select count(*) from public.training_requests q
                  where q.user_id = auth.uid() and q.created_at > now() - interval '24 hours') >= 3 then 'limit'
         end;
$$;

revoke execute on function public.training_request_check(uuid) from public, anon, authenticated;

-- For a trainer's profile in Voltrix, as one value: whether the signed-in person can ask them now
-- (can_ask) and why not (why, codes above), their latest request to this trainer (one waiting, or
-- from the last 30 days: id, status, created_at, answered_at), the trainer of a request waiting
-- elsewhere (waiting_with), and when they may ask again after a no (ask_again_on).
create function public.trainer_request_state(p_trainer uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else
    jsonb_build_object(
      'can_ask', public.training_request_check(p_trainer) is null,
      'why', public.training_request_check(p_trainer),
      'request', (
        select jsonb_build_object('id', q.id,
                                  'status', case when q.status = 'pending' and q.created_at <= now() - interval '14 days'
                                                 then 'expired' else q.status end,
                                  'created_at', q.created_at, 'answered_at', q.answered_at)
          from public.training_requests q
         where q.user_id = auth.uid() and q.trainer_id = p_trainer
           and (q.status = 'pending' or q.created_at > now() - interval '30 days')
         order by q.created_at desc
         limit 1),
      'waiting_with', (
        select coalesce(p.full_name, p.business_name)
          from public.training_requests q
          join public.profiles p on p.id = q.trainer_id
         where q.user_id = auth.uid() and q.status = 'pending' and q.trainer_id <> p_trainer
           and q.created_at > now() - interval '14 days'
         limit 1),
      'ask_again_on', (
        select (max(q.answered_at) + interval '30 days')::date
          from public.training_requests q
         where q.user_id = auth.uid() and q.trainer_id = p_trainer and q.status = 'declined'
           and q.answered_at > now() - interval '30 days'))
  end;
$$;

revoke execute on function public.trainer_request_state(uuid) from public, anon;
grant execute on function public.trainer_request_state(uuid) to authenticated;

-- The signed-in person asks a trainer from the Trainers list to train them, with an optional note
-- and phone number for that trainer, after agreeing to what the trainer will see (p_consent).
-- Returns the request. The trainer gets news.
create function public.ask_trainer(p_trainer uuid, p_note text, p_phone text, p_consent boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  why text;
  first text;
  who text;
  made uuid;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('ask:' || me::text, 0));
  -- A request waiting more than 14 days has expired; the person may ask someone else.
  update public.training_requests q
     set status = 'expired', answered_at = now()
   where q.user_id = me and q.status = 'pending' and q.created_at <= now() - interval '14 days';
  why := public.training_request_check(p_trainer);
  if why is not null then
    raise exception '%', case why
      when 'unconfirmed' then 'Confirm your email first, then send your request.'
      when 'self' then 'This is your own profile.'
      when 'unavailable' then 'This trainer isn''t taking requests on Voltrix.'
      when 'not_taking' then 'This trainer isn''t taking new clients right now.'
      when 'has_trainer' then 'You already have a trainer. To change, leave your trainer in Settings first.'
      when 'waiting' then 'You''ve asked a trainer already. Wait for an answer, or withdraw that request first.'
      when 'declined' then 'This trainer said no to your last request. You can ask again 30 days after their answer.'
      else 'You''ve sent 3 requests today. Try again tomorrow.'
    end using errcode = '22023';
  end if;
  select coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), p.business_name) into first
    from public.profiles p where p.id = p_trainer;
  if not coalesce(p_consent, false) then
    raise exception 'Agree to what % will see first.', first using errcode = '22023';
  end if;
  insert into public.training_requests (user_id, trainer_id, note, phone, consented_at)
  values (me, p_trainer, nullif(left(btrim(coalesce(p_note, '')), 300), ''),
          nullif(left(btrim(coalesce(p_phone, '')), 30), ''), now())
  returning id into made;
  select nullif(btrim(coalesce(p.full_name, '')), '') into who from public.profiles p where p.id = me;
  perform public.tell(p_trainer, 'training_request', null,
    jsonb_build_object('request_id', made, 'name', coalesce(who, 'Someone')));
  return made;
end;
$$;

revoke execute on function public.ask_trainer(uuid, text, text, boolean) from public, anon;
grant execute on function public.ask_trainer(uuid, text, text, boolean) to authenticated;

-- The person withdraws their waiting request. True when it was withdrawn now.
create function public.withdraw_request(p_request uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q public.training_requests;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.training_requests x
     set status = 'withdrawn', answered_at = now()
   where x.id = p_request and x.user_id = me and x.status = 'pending'
  returning x.* into q;
  if q.id is null then
    return false;
  end if;
  perform public.news_settled(q.trainer_id, 'training_request', q.id, true);
  return true;
end;
$$;

revoke execute on function public.withdraw_request(uuid) from public, anon;
grant execute on function public.withdraw_request(uuid) to authenticated;

-- The signed-in person's requests to trainers, waiting or from the last 30 days, newest first,
-- with each trainer's public name and photo.
create function public.my_training_requests()
returns table (
  id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  trainer_avatar text,
  note text,
  status text,
  created_at timestamptz,
  answered_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.trainer_id, p.full_name, p.business_name, p.avatar_url, q.note,
         case when q.status = 'pending' and q.created_at <= now() - interval '14 days' then 'expired' else q.status end,
         q.created_at, q.answered_at
    from public.training_requests q
    join public.profiles p on p.id = q.trainer_id
   where q.user_id = auth.uid()
     and (q.status = 'pending' or q.created_at > now() - interval '30 days')
   order by q.created_at desc
   limit 20;
$$;

revoke execute on function public.my_training_requests() from public, anon;
grant execute on function public.my_training_requests() to authenticated;

-- Requests to the signed-in trainer: waiting ones (oldest first), then those answered or withdrawn
-- in the last 30 days. What the person chose to share: their Voltrix name and photo, note and
-- phone; their email only once accepted.
create function public.training_requests_for_me()
returns table (
  id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  note text,
  phone text,
  status text,
  created_at timestamptz,
  answered_at timestamptz,
  client_id uuid,
  email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.user_id, p.full_name, p.avatar_url, q.note, q.phone, q.status, q.created_at, q.answered_at, q.client_id,
         case when q.status = 'accepted' then (select u.email::text from auth.users u where u.id = q.user_id) end
    from public.training_requests q
    join public.profiles p on p.id = q.user_id
   where auth.uid() is not null
     and q.trainer_id = auth.uid()
     and ((q.status = 'pending' and q.created_at > now() - interval '14 days')
          or (q.status <> 'pending' and q.answered_at > now() - interval '30 days'))
   order by (q.status = 'pending') desc, case when q.status = 'pending' then q.created_at end, q.created_at desc
   limit 50;
$$;

revoke execute on function public.training_requests_for_me() from public, anon;
grant execute on function public.training_requests_for_me() to authenticated;

-- The signed-in trainer answers a request. Accept (needs an active plan) links the person like an
-- accepted invite, on the first of: a row already linked to them; a row they were linked to
-- before (the round 1 lock: only they can rejoin it), made active again; a row waiting with their
-- email; else a new client with their Voltrix name, email and the phone they gave. The round 1
-- triggers mark it joined and tell both sides ('link'). Returns the client row. Decline returns
-- null; with p_block the trainer also blocks the person, so they can't ask again. Answering the
-- same way twice answers the same again.
create function public.answer_request(p_request uuid, p_accept boolean, p_block boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  q public.training_requests;
  person_email text;
  person_name text;
  linked uuid;
  tname text;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into q from public.training_requests x where x.id = p_request and x.trainer_id = me for update;
  if q.id is null then
    raise exception 'This request is no longer available.' using errcode = '22023';
  end if;
  if q.status = 'accepted' and coalesce(p_accept, false) then
    return q.client_id;
  elsif q.status = 'declined' and not coalesce(p_accept, false) then
    return null;
  elsif q.status = 'withdrawn' then
    raise exception 'This request was withdrawn.' using errcode = '22023';
  elsif q.status in ('accepted', 'declined') then
    raise exception 'You''ve answered this request already.' using errcode = '22023';
  elsif q.status <> 'pending' or q.created_at <= now() - interval '14 days' then
    raise exception 'This request is no longer available.' using errcode = '22023';
  end if;
  select coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), p.business_name) into tname
    from public.profiles p where p.id = me;
  if coalesce(p_accept, false) then
    perform public.coach_adding();
    if exists (select 1 from public.clients c where c.user_id = q.user_id and c.status <> 'archived' and c.trainer_id <> me) then
      raise exception 'This person has joined another trainer.' using errcode = '22023';
    end if;
    select u.email::text, nullif(btrim(coalesce(p.full_name, '')), '') into person_email, person_name
      from auth.users u join public.profiles p on p.id = u.id
     where u.id = q.user_id and u.email_confirmed_at is not null;
    if person_email is null then
      raise exception 'This person''s Voltrix account is no longer available.' using errcode = '22023';
    end if;
    select c.id into linked from public.clients c
     where c.trainer_id = me and c.user_id = q.user_id and c.status <> 'archived'
     order by c.created_at desc
     limit 1;
    if linked is null then
      select c.id into linked
        from public.clients c
       where c.trainer_id = me
         and c.user_id is null
         and c.last_user_id = q.user_id
       order by (c.status <> 'archived') desc, c.updated_at desc
       limit 1;
      if linked is null then
        select c.id into linked
          from public.clients c
         where c.trainer_id = me
           and c.user_id is null
           and c.last_user_id is null
           and c.status <> 'archived'
           and c.email is not null
           and lower(c.email) = lower(person_email)
         order by c.created_at desc
         limit 1;
      end if;
      if linked is null then
        insert into public.clients (trainer_id, first_name, last_name, email, phone, user_id)
        values (me,
                left(coalesce(nullif(split_part(coalesce(person_name, ''), ' ', 1), ''), initcap(split_part(person_email, '@', 1))), 200),
                nullif(left(btrim(substr(coalesce(person_name, ''), char_length(split_part(coalesce(person_name, ''), ' ', 1)) + 1)), 200), ''),
                case when char_length(person_email) <= 320 then person_email end,
                q.phone, q.user_id)
        returning id into linked;
      else
        update public.clients c
           set user_id = q.user_id, status = 'active', phone = coalesce(c.phone, q.phone)
         where c.id = linked;
      end if;
    end if;
    update public.training_requests x
       set status = 'accepted', answered_at = coalesce(x.answered_at, now()), client_id = linked
     where x.id = q.id;
  else
    update public.training_requests x set status = 'declined', answered_at = now() where x.id = q.id;
    if coalesce(p_block, false) then
      insert into public.user_blocks (blocker_id, blocked_id) values (me, q.user_id) on conflict do nothing;
    end if;
  end if;
  perform public.news_settled(me, 'training_request', q.id, false);
  perform public.tell(q.user_id, 'training_answered', linked,
    jsonb_build_object('request_id', q.id, 'accepted', coalesce(p_accept, false), 'trainer_id', me, 'trainer_name', tname));
  return linked;
end;
$$;

revoke execute on function public.answer_request(uuid, boolean, boolean) from public, anon;
grant execute on function public.answer_request(uuid, boolean, boolean) to authenticated;

-- When a person is linked to a trainer in any way (an invite, a code, a request), their waiting
-- request to that trainer counts as accepted and one to anyone else is withdrawn (that trainer's
-- open app hears it). When a person leaves a trainer, or the trainer archives them, their booking
-- requests still waiting there are withdrawn, so they no longer hold times.
create function public.clients_after_link_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if new.user_id is not null and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    for r in
      update public.training_requests t
         set status = case when t.trainer_id = new.trainer_id then 'accepted' else 'withdrawn' end,
             answered_at = now(),
             client_id = case when t.trainer_id = new.trainer_id then new.id else t.client_id end
       where t.user_id = new.user_id
         and t.status = 'pending'
      returning t.id, t.trainer_id
    loop
      perform public.news_settled(r.trainer_id, 'training_request', r.id, r.trainer_id <> new.trainer_id);
    end loop;
  end if;
  if tg_op = 'UPDATE'
     and ((old.user_id is not null and new.user_id is distinct from old.user_id)
          or (new.status = 'archived' and old.status <> 'archived')) then
    for r in
      update public.booking_requests q
         set status = 'withdrawn', answered_at = now()
       where q.client_id = new.id
         and q.status = 'pending'
      returning q.id, q.trainer_id
    loop
      perform public.news_settled(r.trainer_id, 'requested', r.id, false);
    end loop;
  end if;
  return null;
end;
$$;

revoke execute on function public.clients_after_link_change() from public, anon, authenticated;

create trigger clients_after_link_change after insert or update of user_id, status on public.clients
  for each row execute function public.clients_after_link_change();

-- list_trainers() plus whether each trainer takes new clients, for people without a trainer: the
-- Trainers list is hidden from anyone with one (paused counts), so this returns nothing for them.
-- A trainer and a person who blocked one another don't see each other here.
-- list_trainers() stays for app versions already on phones (and for reels and stories).
create function public.list_trainers_v2()
returns table (
  id uuid,
  full_name text,
  business_name text,
  avatar_url text,
  specialties text[],
  bio text,
  city text,
  years_experience int,
  accepting_clients boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.full_name, l.business_name, l.avatar_url, l.specialties, l.bio, l.city, l.years_experience,
         p.accepting_clients
    from public.list_trainers() l
    join public.profiles p on p.id = l.id
   where auth.uid() is not null
     and not exists (select 1 from public.clients c where c.user_id = auth.uid() and c.status <> 'archived')
     and not exists (select 1 from public.user_blocks b
                      where (b.blocker_id = auth.uid() and b.blocked_id = l.id)
                         or (b.blocker_id = l.id and b.blocked_id = auth.uid()))
   order by l.full_name nulls last, l.business_name, l.id;
$$;

revoke execute on function public.list_trainers_v2() from public, anon;
grant execute on function public.list_trainers_v2() to authenticated;

-- ---------- 9. Health form ----------

-- The questions, in Voltrix's own words (PAR-Q style; not the PAR-Q+ text), by version. Answers
-- keep the version they were given in, so their meaning never changes. Both apps show these.
create function public.health_questions(p_version smallint default 1)
returns table (key text, "position" smallint, question text)
language sql
immutable
set search_path = ''
as $$
  select q.key, q.pos, q.question
    from (values
      (1::smallint, 'heart', 1::smallint, 'Has a doctor ever told you that you have a heart condition or high blood pressure?'),
      (1, 'chest_pain', 2, 'Do you feel pain, tightness or pressure in your chest, at rest or when you are active?'),
      (1, 'dizzy', 3, 'In the last 12 months, have you fainted, or lost your balance because you felt dizzy?'),
      (1, 'condition', 4, 'Do you have another long-term medical condition, such as diabetes, asthma, epilepsy, or a lung or kidney condition?'),
      (1, 'medicine', 5, 'Do you take prescribed medicine for a long-term condition?'),
      (1, 'joints', 6, 'Do you have a bone, joint or muscle problem (your back, knees, hips or shoulders, for example) that exercise could make worse?'),
      (1, 'supervised', 7, 'Has a doctor told you to limit how active you are, or to exercise only with medical supervision?'),
      (1, 'pregnant', 8, 'Are you pregnant, or have you given birth in the last 6 months?')
    ) q (version, key, pos, question)
   where q.version = p_version
   order by q.pos;
$$;

revoke execute on function public.health_questions(smallint) from public, anon;
grant execute on function public.health_questions(smallint) to authenticated;

-- Every question of the version answered yes or no, and nothing else.
create function public.health_answers_ok(p_answers jsonb, p_version smallint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(p_answers) = 'object', false)
     and (select count(*) from jsonb_object_keys(p_answers)) = (select count(*) from public.health_questions(p_version))
     and not exists (
       select 1 from public.health_questions(p_version) q
        where coalesce(jsonb_typeof(p_answers -> q.key), '') <> 'boolean'
     );
$$;

revoke execute on function public.health_answers_ok(jsonb, smallint) from public, anon;
grant execute on function public.health_answers_ok(jsonb, smallint) to authenticated;

-- Any yes means: check with a doctor before training hard.
create function public.health_needs_doctor(p_answers jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (select 1 from jsonb_each(p_answers) e where e.value = 'true'::jsonb);
$$;

revoke execute on function public.health_needs_doctor(jsonb) from public, anon;
grant execute on function public.health_needs_doctor(jsonb) to authenticated;

-- One health form per person: their answers, anything else they want their trainers to know, an
-- optional emergency contact and the name they typed to sign it. Health information is special
-- personal information (POPIA): only the person reads, changes or removes it, and their trainers
-- read it only through client_health_form() while they coach them (the round 1 rule).
create table public.health_forms (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  version smallint not null default 1
    constraint health_forms_version_check check (version = 1),
  answers jsonb not null,
  details text
    constraint health_forms_details_check check (details is null or char_length(details) <= 1000),
  emergency_name text
    constraint health_forms_emergency_name_check check (emergency_name is null or char_length(emergency_name) <= 120),
  emergency_phone text
    constraint health_forms_emergency_phone_check check (emergency_phone is null or char_length(emergency_phone) <= 30),
  signed_name text not null
    constraint health_forms_signed_name_check check (char_length(btrim(signed_name)) between 2 and 200),
  needs_doctor boolean generated always as (public.health_needs_doctor(answers)) stored,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_forms_answers_check check (public.health_answers_ok(answers, version))
);

create trigger health_forms_set_updated_at before update on public.health_forms
  for each row execute function public.set_updated_at();

alter table public.health_forms enable row level security;
revoke all on public.health_forms from anon, authenticated;
-- Written through save_health_form(); "Remove my answers" removes the row directly.
grant select, delete on public.health_forms to authenticated;

create policy health_forms_select_own on public.health_forms
  for select to authenticated using (user_id = (select auth.uid()));
create policy health_forms_delete_own on public.health_forms
  for delete to authenticated using (user_id = (select auth.uid()));

-- The signed-in person's health form as one value, or null when they haven't filled it in.
create function public.my_health_form()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(h) - 'user_id' from public.health_forms h where h.user_id = auth.uid();
$$;

revoke execute on function public.my_health_form() from public, anon;
grant execute on function public.my_health_form() to authenticated;

-- Saves the signed-in person's health form (new, or changed: signed again now). Returns the form
-- as my_health_form() does.
create function public.save_health_form(
  p_answers jsonb,
  p_details text,
  p_emergency_name text,
  p_emergency_phone text,
  p_signed_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_answers is null or not public.health_answers_ok(p_answers, 1::smallint) then
    raise exception 'Answer every question with yes or no.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_signed_name, ''))) not between 2 and 200 then
    raise exception 'Type your full name to sign.' using errcode = '22023';
  end if;
  insert into public.health_forms (user_id, version, answers, details, emergency_name, emergency_phone, signed_name, signed_at)
  values (me, 1, p_answers, nullif(left(btrim(coalesce(p_details, '')), 1000), ''),
          nullif(left(btrim(coalesce(p_emergency_name, '')), 120), ''),
          nullif(left(btrim(coalesce(p_emergency_phone, '')), 30), ''),
          left(btrim(p_signed_name), 200), now())
  on conflict (user_id) do update
    set version = excluded.version, answers = excluded.answers, details = excluded.details,
        emergency_name = excluded.emergency_name, emergency_phone = excluded.emergency_phone,
        signed_name = excluded.signed_name, signed_at = excluded.signed_at;
  return public.my_health_form();
end;
$$;

revoke execute on function public.save_health_form(jsonb, text, text, text, text) from public, anon;
grant execute on function public.save_health_form(jsonb, text, text, text, text) to authenticated;

-- A client's health form for their trainer, only while the trainer coaches them (coached_user,
-- the round 1 rule). Null otherwise, and null when they haven't filled it in.
create function public.client_health_form(p_client uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(h) - 'user_id'
    from public.health_forms h
   where h.user_id = public.coached_user(p_client);
$$;

revoke execute on function public.client_health_form(uuid) from public, anon;
grant execute on function public.client_health_form(uuid) to authenticated;

-- Each trainer who coaches the person (the round 1 rule) gets news when the form is filled in, its
-- answers, details or emergency contact change, or it is removed (a new signature alone tells
-- nobody).
create function public.health_forms_news()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid := coalesce(new.user_id, old.user_id);
  link record;
begin
  if tg_op = 'UPDATE'
     and (new.answers, new.details, new.emergency_name, new.emergency_phone)
         is not distinct from (old.answers, old.details, old.emergency_name, old.emergency_phone) then
    return null;
  end if;
  for link in
    select c.id, c.trainer_id from public.clients c
     where c.user_id = person and c.status <> 'archived' and c.invite_status = 'joined' and c.last_user_id = person
  loop
    perform public.tell(link.trainer_id, 'health', link.id,
      jsonb_build_object('needs_doctor', case when tg_op = 'DELETE' then null else new.needs_doctor end,
                         'change', lower(tg_op)));
  end loop;
  return null;
end;
$$;

revoke execute on function public.health_forms_news() from public, anon, authenticated;

create trigger health_forms_news after insert or update or delete on public.health_forms
  for each row execute function public.health_forms_news();

-- ---------- 10. Calendar link ----------

-- One private calendar link per person: the token is the secret in the link (64 hex characters,
-- 244 random bits). It is kept so the app can show the link again (as Google Calendar does with
-- its secret address); the private schema isn't reachable through the API. Resetting makes a new
-- one and the old link stops working at once. No token: the link is off.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.calendar_feeds (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token text unique
    constraint calendar_feeds_token_check check (token is null or token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table private.calendar_feeds enable row level security;
revoke all on private.calendar_feeds from public, anon, authenticated;

create function public.new_feed_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
$$;

revoke execute on function public.new_feed_token() from public, anon, authenticated;

-- The signed-in person's calendar link as {token, created_at, last_used_at}; token null while the
-- link is off. With p_make, a link is made when there is none or it is off.
create function public.calendar_link(p_make boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  f private.calendar_feeds;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into f from private.calendar_feeds x where x.user_id = me;
  if f.token is null and coalesce(p_make, false) then
    insert into private.calendar_feeds (user_id, token) values (me, public.new_feed_token())
    on conflict (user_id) do update set token = excluded.token, created_at = now(), last_used_at = null
    returning * into f;
  end if;
  return jsonb_build_object('token', f.token, 'created_at', f.created_at, 'last_used_at', f.last_used_at);
end;
$$;

revoke execute on function public.calendar_link(boolean) from public, anon;
grant execute on function public.calendar_link(boolean) to authenticated;

-- A new link: the old one stops working at once. Answers like calendar_link().
create function public.reset_calendar_link()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  f private.calendar_feeds;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into private.calendar_feeds (user_id, token) values (me, public.new_feed_token())
  on conflict (user_id) do update set token = excluded.token, created_at = now(), last_used_at = null
  returning * into f;
  return jsonb_build_object('token', f.token, 'created_at', f.created_at, 'last_used_at', f.last_used_at);
end;
$$;

revoke execute on function public.reset_calendar_link() from public, anon;
grant execute on function public.reset_calendar_link() to authenticated;

-- Turns the link off: it stops working until a new one is made. Answers like calendar_link().
create function public.calendar_link_off()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update private.calendar_feeds f set token = null, last_used_at = null where f.user_id = me;
  return jsonb_build_object('token', null, 'created_at', null, 'last_used_at', null);
end;
$$;

revoke execute on function public.calendar_link_off() from public, anon;
grant execute on function public.calendar_link_off() to authenticated;

-- For the calendar-feed Edge Function only (service role): the calendar a token opens, as one
-- value, or null for a token that opens nothing. Sessions from 60 days ago to about a year ahead
-- (at most 2000), not cancelled ones (so calendars clear them): the ones the person trains (a
-- client's first name and last initial, or the blocked time's title) and the ones they train in
-- ("Training with Thandi"), with start, length, place ("Video call in Voltrix" for online ones)
-- and last change. Never notes, prices, payments, phone numbers, emails or health.
create function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f private.calendar_feeds;
  p public.profiles;
  events jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into f from private.calendar_feeds x where x.token = p_token;
  if f.user_id is null then
    return null;
  end if;
  if f.last_used_at is null or f.last_used_at < now() - interval '1 hour' then
    update private.calendar_feeds x set last_used_at = now() where x.user_id = f.user_id;
  end if;
  select * into p from public.profiles x where x.id = f.user_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'starts_at', e.starts_at,
           'minutes', e.duration_minutes,
           'summary', e.summary,
           'location', case when e.online then 'Video call in Voltrix' else e.location end,
           'updated_at', e.updated_at) order by e.starts_at, e.id), '[]'::jsonb)
    into events
    from (
      select x.*
        from (
          select s.id, s.starts_at, s.duration_minutes, s.online, s.location, s.updated_at,
                 case when c.id is not null
                      then btrim(c.first_name || coalesce(' ' || left(nullif(btrim(c.last_name), ''), 1) || '.', ''))
                      else coalesce(s.title, 'Busy') end as summary
            from public.sessions s
            left join public.clients c on c.id = s.client_id
           where s.trainer_id = f.user_id
             and s.status <> 'cancelled'
             and s.starts_at >= now() - interval '60 days'
             and s.starts_at < now() + interval '400 days'
          union all
          select s.id, s.starts_at, s.duration_minutes, s.online, s.location, s.updated_at,
                 'Training with ' || coalesce(nullif(split_part(btrim(coalesce(tp.full_name, '')), ' ', 1), ''),
                                              tp.business_name, 'your trainer')
            from public.sessions s
            join public.clients c on c.id = s.client_id
            join public.profiles tp on tp.id = s.trainer_id
           where c.user_id = f.user_id
             and c.status <> 'archived'
             and s.trainer_id <> f.user_id
             and s.status <> 'cancelled'
             and s.starts_at >= now() - interval '60 days'
             and s.starts_at < now() + interval '400 days'
        ) x
       order by x.starts_at, x.id
       limit 2000
    ) e;
  return jsonb_build_object(
    'name', case when p.role = 'trainer' then 'Voltrix Coach' else 'Voltrix' end,
    'time_zone', p.time_zone,
    'events', events);
end;
$$;

revoke execute on function public.calendar_feed(text) from public, anon, authenticated;
grant execute on function public.calendar_feed(text) to service_role;

-- ---------- 11. Who needs you, with money, packs, booking and health ----------

-- clients_overview() (round 2, same rows, order and first columns) plus, per client:
--   self_booking, doctor_ok_on        the client row's
--   health                            'missing', 'clear', 'doctor' (an answer needs a doctor's
--                                     go-ahead) or 'doctor_ok' (the trainer noted one on or after
--                                     the day it was signed); null while the trainer may not read
--                                     it (the round 1 rule). health_signed_at its day.
--   owed_cents, owed_count, owed_since   owed now in the trainer's currency (owed_items());
--                                     owed_other: something owed in another currency too
--   pack_*                            the pack in use: the one the next booking would use, else
--                                     the newest still running (size, used, booked, left, end,
--                                     paid)
--   series_count                      repeats still running
--   booking_requests                  their booking requests waiting for an answer
create function public.clients_overview_v2(p_today date, p_client uuid default null)
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
  unanswered_check_in_id uuid,
  self_booking boolean,
  doctor_ok_on date,
  health text,
  health_signed_at timestamptz,
  owed_cents bigint,
  owed_count integer,
  owed_since date,
  owed_other boolean,
  pack_id uuid,
  pack_total integer,
  pack_used integer,
  pack_booked integer,
  pack_left integer,
  pack_expires_on date,
  pack_paid boolean,
  series_count integer,
  booking_requests integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.currency, p.charge_no_shows, p.time_zone, (now() at time zone p.time_zone)::date as today
      from public.profiles p
     where p.id = auth.uid()
  )
  select o.*,
         c.self_booking, c.doctor_ok_on,
         case when u.person is null then null
              when hf.user_id is null then 'missing'
              when not hf.needs_doctor then 'clear'
              when c.doctor_ok_on >= (hf.signed_at at time zone me.time_zone)::date then 'doctor_ok'
              else 'doctor' end,
         case when u.person is not null then hf.signed_at end,
         coalesce(ow.cents, 0)::bigint, coalesce(ow.n, 0), ow.since, coalesce(ow.other, false),
         pk.id, pk.sessions_total, pk.used, pk.booked, greatest(pk.sessions_total - pk.used - pk.booked, 0),
         pk.expires_on, pk.paid_on is not null,
         (select count(*)::int from public.session_series ss
           where ss.client_id = o.client_id and ss.trainer_id = me.id
             and (ss.ends_on is null or ss.ends_on >= (now() at time zone ss.time_zone)::date)),
         (select count(*)::int from public.booking_requests q
           where q.client_id = o.client_id and q.trainer_id = me.id and q.status = 'pending' and q.starts_at > now())
    from public.clients_overview(p_today, p_client) o
   cross join me
    join public.clients c on c.id = o.client_id
   cross join lateral (select public.coached_user(o.client_id) as person) u
    left join public.health_forms hf on hf.user_id = u.person
    left join lateral (
      select sum(i.cents) filter (where i.currency = me.currency) as cents,
             (count(*) filter (where i.currency = me.currency))::int as n,
             min(i.day) filter (where i.currency = me.currency) as since,
             bool_or(i.currency <> me.currency) as other
        from (
          select s.price_cents as cents, s.currency, (s.starts_at at time zone me.time_zone)::date as day
            from public.sessions s
           where s.client_id = o.client_id
             and s.trainer_id = me.id
             and s.pack_id is null
             and s.paid_on is null
             and s.price_cents > 0
             and (s.status = 'completed' or (s.status = 'no_show' and me.charge_no_shows))
          union all
          select k.price_cents, k.currency, k.sold_on
            from public.session_packs k
           where k.client_id = o.client_id
             and k.trainer_id = me.id
             and k.paid_on is null
             and k.price_cents > 0
        ) i
    ) ow on true
    left join lateral (
      select y.id, y.sessions_total, y.used, y.booked, y.expires_on, y.paid_on
        from (
          select k.id, k.sessions_total::int as sessions_total, k.expires_on, k.paid_on, k.sold_on, k.created_at,
                 (select count(*)::int from public.sessions s
                   where s.pack_id = k.id
                     and (s.status = 'completed' or (s.status = 'no_show' and me.charge_no_shows))) as used,
                 (select count(*)::int from public.sessions s where s.pack_id = k.id and s.status = 'scheduled') as booked
            from public.session_packs k
           where k.client_id = o.client_id
             and k.trainer_id = me.id
             and (k.expires_on is null or k.expires_on >= me.today)
        ) y
       order by (y.sessions_total - y.used - y.booked > 0) desc,
                case when y.sessions_total - y.used - y.booked > 0 then y.expires_on end nulls last,
                case when y.sessions_total - y.used - y.booked > 0 then y.sold_on end,
                y.sold_on desc, y.created_at desc, y.id
       limit 1
    ) pk on true
   order by lower(o.first_name), lower(coalesce(o.last_name, '')), o.client_id;
$$;

revoke execute on function public.clients_overview_v2(date, uuid) from public, anon;
grant execute on function public.clients_overview_v2(date, uuid) to authenticated;

-- ---------- 12. The nightly top-up of repeat bookings ----------

-- 02:15 in South Africa (00:15 UTC). Only where Supabase Cron is installed (the live project), so
-- the file also builds on a plain Postgres. Scheduling a job with the same name again updates it.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule('extend-repeat-bookings', '15 0 * * *', 'select public.extend_all_series()');
  end if;
end;
$$;
