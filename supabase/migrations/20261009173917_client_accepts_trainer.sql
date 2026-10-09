-- A client accepts a trainer before they are linked (Ryan, 2026-10-09, decision: "a client
-- accepts a trainer before they are linked").
--
-- Before, a trainer who typed any email into Voltrix Coach linked that person the next time
-- they signed in to Voltrix (claim_my_invites), and the trainer then saw their food diary,
-- plan ticks, chat and calls, with no way for the person to say no or to leave. Now:
--
--   * Adding someone's email is an invite. The person sees it in Voltrix (my_invites) and
--     accepts or declines it. Only accepting sets clients.user_id, so everything that goes by
--     user_id (plans, sessions, chat, calls, the food diary, their photo in chats) starts
--     then, exactly as before. Until then the trainer has only what they typed.
--   * The person can leave a trainer in Settings (leave_trainer). The row stays with the
--     trainer, with their notes and history, but is no longer linked.
--   * Voltrix Coach shows each client's state (clients.app_status): not on Voltrix yet,
--     invite waiting, declined, joined or left. A trainer can invite a client who declined or
--     left again (invite_client_again), and a new email on the row is a new invite.
--   * Clients already linked stay linked: they count as accepted.
--   * A client row belongs to the first person who joins it. The chat, chat photos and plan
--     ticks on it are theirs, so after they leave only they can join it again
--     (last_user_id). Anyone else is added as a new client.
--
-- invite_status, invited_at, invite_answered_at and last_user_id are written only by the
-- database (these functions and the triggers below), so like user_id they stay out of the
-- trainer's insert and update grants.

-- ---------- Invite state on each client row ----------

alter table public.clients
  add column if not exists invite_status text not null default 'waiting',
  add column if not exists invited_at timestamptz not null default now(),
  add column if not exists invite_answered_at timestamptz,
  add column if not exists last_user_id uuid;

comment on column public.clients.invite_status is
  'waiting (not answered), joined (accepted: user_id is set), declined, or left. Written only by the database.';
-- No foreign key: it outlives a deleted account, so nobody else can take over that chat.
comment on column public.clients.last_user_id is
  'The person linked to this row now or last. Once set, only they can accept an invite on it. Written only by the database.';

-- Rows from before: invited when they were added; the ones already linked count as accepted.
update public.clients
   set invited_at = created_at,
       invite_status = case when user_id is not null then 'joined' else 'waiting' end,
       invite_answered_at = case when user_id is not null then updated_at end,
       last_user_id = user_id;

-- A row whose person deleted their account before this change still has the trainer's side
-- of their chat. It counts as left, and the nil id (nobody's) keeps anyone else from joining it.
update public.clients c
   set invite_status = 'left',
       invite_answered_at = c.updated_at,
       last_user_id = '00000000-0000-0000-0000-000000000000'
 where c.user_id is null
   and exists (select 1 from public.messages m where m.chat_id = c.id);

alter table public.clients
  add constraint clients_invite_status_check check (invite_status in ('waiting', 'joined', 'declined', 'left')),
  add constraint clients_invite_joined_check check ((invite_status = 'joined') = (user_id is not null));

-- Finding a person's invites by their email.
create index if not exists clients_invite_email_idx on public.clients (lower(email))
  where user_id is null and email is not null;

-- Keeps invite_status and last_user_id in step with user_id. Linking only happens in
-- accept_trainer_invite(). When the link ends without leave_trainer() (the person deleted
-- their account, which clears user_id), it counts as leaving. A trainer who changes the
-- email of a client who isn't linked sends a new invite, even after a no (to the person who
-- left, when someone has been linked).
create or replace function public.clients_keep_invite_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is not null then
    new.last_user_id := new.user_id;
    if new.invite_status <> 'joined' then
      new.invite_status := 'joined';
      new.invite_answered_at := now();
    end if;
  elsif tg_op = 'INSERT' then
    new.last_user_id := null;
    new.invite_status := 'waiting';
    new.invited_at := now();
    new.invite_answered_at := null;
  else
    -- Not linked now: the row stays with whoever was linked to it last.
    new.last_user_id := coalesce(old.user_id, old.last_user_id);
    if old.user_id is not null then
      if new.invite_status = 'joined' then
        new.invite_status := 'left';
        new.invite_answered_at := now();
      end if;
    elsif lower(new.email) is distinct from lower(old.email) then
      new.invite_status := 'waiting';
      new.invited_at := now();
      new.invite_answered_at := null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.clients_keep_invite_status() from public, anon, authenticated;

create trigger clients_keep_invite_status before insert or update on public.clients
  for each row execute function public.clients_keep_invite_status();

-- Live news ('link' on the inbox channel) so open screens update: the trainer hears when
-- the person answers or leaves, the person hears (on every phone) when they are invited,
-- when an invite to them is answered, withdrawn or archived, and when a link starts or
-- ends. Best effort, like messages.
create or replace function public.clients_after_invite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  people uuid[] := array[new.user_id];
  person uuid;
begin
  if tg_op = 'UPDATE' then
    if new.invite_status is not distinct from old.invite_status
       and new.invited_at is not distinct from old.invited_at
       and new.user_id is not distinct from old.user_id
       and new.status is not distinct from old.status
       and lower(new.email) is not distinct from lower(old.email) then
      return null;
    end if;
    people := people || new.trainer_id || old.user_id;
    -- Whoever an invite was addressed to before the email changed.
    if old.user_id is null and old.last_user_id is null and lower(old.email) is distinct from lower(new.email) then
      people := people || array(
        select u.id from auth.users u
         where lower(u.email) = lower(old.email) and u.email_confirmed_at is not null
      );
    end if;
  end if;
  -- Invites on a row someone has left can only be for that person.
  if new.user_id is null and new.last_user_id is not null then
    people := people || new.last_user_id;
  elsif new.user_id is null and new.email is not null then
    people := people || array(
      select u.id from auth.users u
       where lower(u.email) = lower(new.email) and u.email_confirmed_at is not null
    );
  end if;
  for person in select distinct p from unnest(people) p where p is not null loop
    perform public.send_to_inbox(person, 'link',
      jsonb_build_object('client_id', new.id, 'trainer_id', new.trainer_id, 'invite_status', new.invite_status));
  end loop;
  return null;
end;
$$;

revoke execute on function public.clients_after_invite_change() from public, anon, authenticated;

create trigger clients_after_invite_change after insert or update on public.clients
  for each row execute function public.clients_after_invite_change();

-- ---------- The person's side (Voltrix) ----------

-- Kept for app versions already on phones, which call it on Home. Invites now wait for the
-- person to accept them, so this links nobody.
create or replace function public.claim_my_invites()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return 0;
end;
$$;

revoke execute on function public.claim_my_invites() from public, anon;
grant execute on function public.claim_my_invites() to authenticated;

-- Trainers waiting for the signed-in person to answer: invites to their confirmed email
-- that aren't answered or archived, on rows nobody else has been linked to. One per trainer
-- (a trainer who added the email twice shows once), and none from a trainer they are
-- already with. Newest first. Only the trainer's public name and photo.
create or replace function public.my_invites()
returns table (
  client_id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  trainer_avatar text,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.trainer_id, i.full_name, i.business_name, i.avatar_url, i.invited_at
    from (
      select distinct on (c.trainer_id) c.id, c.trainer_id, p.full_name, p.business_name, p.avatar_url, c.invited_at
        from public.clients c
        join public.profiles p on p.id = c.trainer_id
        join auth.users u on u.id = auth.uid() and u.email_confirmed_at is not null
       where c.user_id is null
         and c.invite_status = 'waiting'
         and c.status <> 'archived'
         and c.email is not null
         and lower(c.email) = lower(u.email)
         and (c.last_user_id is null or c.last_user_id = u.id)
         and not exists (
           select 1 from public.clients l
            where l.trainer_id = c.trainer_id and l.user_id = u.id and l.status <> 'archived'
         )
       order by c.trainer_id, c.invited_at desc
    ) i
   order by i.invited_at desc;
$$;

revoke execute on function public.my_invites() from public, anon;
grant execute on function public.my_invites() to authenticated;

-- Accept an invite: links the signed-in person to the trainer (every unanswered invite from
-- that trainer to their email, so a trainer who added them twice is answered once). Never a
-- row someone else was linked to. Returns how many rows were linked; 0 when it was already
-- accepted (on another phone).
create or replace function public.accept_trainer_invite(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  trainer uuid;
  linked integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select u.email into my_email from auth.users u where u.id = me and u.email_confirmed_at is not null;
  select c.trainer_id into trainer
    from public.clients c
   where c.id = p_client
     and c.user_id is null
     and c.invite_status = 'waiting'
     and c.status <> 'archived'
     and my_email is not null
     and lower(c.email) = lower(my_email)
     and (c.last_user_id is null or c.last_user_id = me);
  if trainer is null then
    if exists (select 1 from public.clients c where c.id = p_client and c.user_id = me) then
      return 0;
    end if;
    raise exception 'This invite is no longer available.' using errcode = '22023';
  end if;
  update public.clients c
     set user_id = me, invite_status = 'joined', invite_answered_at = now()
   where c.trainer_id = trainer
     and c.user_id is null
     and c.invite_status = 'waiting'
     and c.status <> 'archived'
     and lower(c.email) = lower(my_email)
     and (c.last_user_id is null or c.last_user_id = me);
  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke execute on function public.accept_trainer_invite(uuid) from public, anon;
grant execute on function public.accept_trainer_invite(uuid) to authenticated;

-- Decline an invite: the trainer sees it was declined and can send it again later. Returns
-- how many rows were declined; 0 when there was nothing to decline.
create or replace function public.decline_trainer_invite(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  trainer uuid;
  declined integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select u.email into my_email from auth.users u where u.id = me and u.email_confirmed_at is not null;
  select c.trainer_id into trainer
    from public.clients c
   where c.id = p_client
     and c.user_id is null
     and c.invite_status = 'waiting'
     and c.status <> 'archived'
     and my_email is not null
     and lower(c.email) = lower(my_email)
     and (c.last_user_id is null or c.last_user_id = me);
  if trainer is null then
    return 0;
  end if;
  update public.clients c
     set invite_status = 'declined', invite_answered_at = now()
   where c.trainer_id = trainer
     and c.user_id is null
     and c.invite_status = 'waiting'
     and c.status <> 'archived'
     and lower(c.email) = lower(my_email)
     and (c.last_user_id is null or c.last_user_id = me);
  get diagnostics declined = row_count;
  return declined;
end;
$$;

revoke execute on function public.decline_trainer_invite(uuid) from public, anon;
grant execute on function public.decline_trainer_invite(uuid) to authenticated;

-- Leave a trainer: unlinks the signed-in person from the trainer of this client row (from
-- every row of theirs, if the trainer added them twice, archived ones too), and says no to
-- any other invite from that trainer still waiting for them. The trainer keeps their notes,
-- sessions and plans on the rows. A call still ringing or going in those chats ends.
-- Returns false when the person wasn't linked to it (already left, or not theirs).
create or replace function public.leave_trainer(p_client uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  trainer uuid;
  k record;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select c.trainer_id into trainer from public.clients c where c.id = p_client and c.user_id = me;
  if trainer is null then
    return false;
  end if;
  for k in
    select id, status, caller_id from public.calls
     where status in ('ringing', 'accepted')
       and chat_id in (select c.id from public.clients c where c.trainer_id = trainer and c.user_id = me)
  loop
    perform public.finish_call(k.id,
      case when k.status = 'accepted' then 'ended' when k.caller_id = me then 'cancelled' else 'declined' end);
  end loop;
  update public.clients c
     set user_id = null, invite_status = 'left', invite_answered_at = now()
   where c.trainer_id = trainer
     and c.user_id = me;
  -- A second invite from the same trainer (they added the person again) would otherwise
  -- show straight after leaving.
  select u.email into my_email from auth.users u where u.id = me and u.email_confirmed_at is not null;
  update public.clients c
     set invite_status = 'declined', invite_answered_at = now()
   where c.trainer_id = trainer
     and c.user_id is null
     and c.invite_status = 'waiting'
     and my_email is not null
     and lower(c.email) = lower(my_email)
     and (c.last_user_id is null or c.last_user_id = me);
  return true;
end;
$$;

revoke execute on function public.leave_trainer(uuid) from public, anon;
grant execute on function public.leave_trainer(uuid) to authenticated;

-- Like my_trainers(), plus the trainer's photo and when the person accepted, for Settings >
-- My trainers. Also the links a trainer archived (client_status 'archived'): the trainer sees
-- the person's food diary and chat again if they make them active, so Settings lists them
-- too, with Leave. Home leaves them out. my_trainers() stays for app versions already on phones.
create or replace function public.my_trainers_v2()
returns table (
  client_id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  client_status text,
  trainer_avatar text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, p.id, p.full_name, p.business_name, c.status, p.avatar_url, c.invite_answered_at
    from public.clients c
    join public.profiles p on p.id = c.trainer_id
   where c.user_id = auth.uid()
   order by c.created_at;
$$;

revoke execute on function public.my_trainers_v2() from public, anon;
grant execute on function public.my_trainers_v2() to authenticated;

-- ---------- The trainer's side (Voltrix Coach) ----------

-- Where a client is with the Voltrix app, for their trainer only (null for anyone else):
--   joined      accepted the invite; linked
--   invited     has a Voltrix account with this email and hasn't answered
--   not_on_app  no Voltrix account with this email yet (or no email)
--   declined    said no to the invite
--   left        left this trainer
--   gone        the person who was linked left, and the email on the row isn't theirs on
--               Voltrix now (they changed it, the trainer did, or they deleted their
--               account). The row stays theirs, so nobody can be invited on it: the trainer
--               adds anyone else as a new client.
-- The apps read it like a column (select=...,app_status). The row is read again by id, so
-- made-up rows can't be used to find out whether an email has an account.
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
             select 1 from auth.users u
              where u.id = c.last_user_id and u.email_confirmed_at is not null
                and c.email is not null and lower(u.email) = lower(c.email)
           ) then 'gone'
           when c.invite_status in ('declined', 'left') then c.invite_status
           when c.last_user_id is not null then 'invited'
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

revoke execute on function public.app_status(public.clients) from public, anon;
grant execute on function public.app_status(public.clients) to authenticated;

-- Invite a client who declined or left again. Does nothing for anyone else's client, one
-- who is linked or still has an invite waiting, or one whose invite can't reach the person
-- who left (app_status 'gone').
create or replace function public.invite_client_again(p_client uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  update public.clients c
     set invite_status = 'waiting', invited_at = now(), invite_answered_at = null
   where c.id = p_client
     and c.trainer_id = auth.uid()
     and c.user_id is null
     and c.invite_status in ('declined', 'left')
     and (c.last_user_id is null or exists (
       select 1 from auth.users u
        where u.id = c.last_user_id and u.email_confirmed_at is not null and lower(u.email) = lower(c.email)
     ));
end;
$$;

revoke execute on function public.invite_client_again(uuid) from public, anon;
grant execute on function public.invite_client_again(uuid) to authenticated;

-- ---------- Plan ticks after leaving ----------

-- Is this a tick by the person linked to the plan's client row, on a plan the signed-in
-- trainer set? Once someone leaves, their trainer no longer sees their ticks (they come
-- back if the person accepts again). Plans and client rows are the trainer's own, so this
-- needs no extra rights.
create or replace function public.sees_plan_tick(p_item uuid, p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.plan_items pi
      join public.clients c on c.id = pi.client_id
     where pi.id = p_item
       and pi.trainer_id = auth.uid()
       and c.user_id = p_user
  );
$$;

revoke execute on function public.sees_plan_tick(uuid, uuid) from public, anon;
grant execute on function public.sees_plan_tick(uuid, uuid) to authenticated;

alter policy plan_completions_select on public.plan_completions
  using (user_id = (select auth.uid()) or (select public.sees_plan_tick(plan_item_id, user_id)));

-- The client's plan, as before, with only their own ticks: a tick saved by anyone else on
-- the same plan (from before this change) isn't theirs to see.
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
   where auth.uid() is not null
     and c.user_id = auth.uid()
     and c.status <> 'archived'
     and c.trainer_id = pi.trainer_id
     and w.trainer_id = pi.trainer_id
     and p_to - p_from between 0 and 62
   order by c.created_at, pi.position, pi.created_at;
$$;

revoke execute on function public.my_plan(date, date) from public, anon;
grant execute on function public.my_plan(date, date) to authenticated;
