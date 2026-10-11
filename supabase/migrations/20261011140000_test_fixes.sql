-- Fixes from testing both apps (11 October 2026):
--   1. Trainers start the free trial themselves while card payments aren't connected, so nobody
--      who signs up, or whose trial ends, is locked out.
--   2. Archived clients who still owe money stay on Who owes you.
--   3. A session moved on or off a pack tells the client's open Voltrix app (their pack count).
--   4. Blocking someone settles a request to train waiting between the two of them.
--   5. Each person can find and remove the chat photos they sent, also once that chat has ended.
--   6. A profile photo can only be the person's own photo in this project's avatars folder.

-- ---------- 1. The free trial, without a card for now ----------

-- Card payments are not connected yet. Until they are, a trainer starts the 14-day free trial
-- themselves: once their business is set up (Start my free trial), and again when a trial has
-- ended and they have never paid (Keep going free), so nobody is locked out while there is no way
-- to pay. A trial that is still running, a plan, free access and the owner are left as they are.
-- Returns when the trial ends (null for the owner and free access). When card payments are
-- connected, the billing work replaces this function: the trial then starts when a card is added.
create function public.start_my_trial()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  p public.profiles;
  ends timestamptz;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into p from public.profiles x where x.id = me for update;
  if p.id is null or p.role <> 'trainer' then
    raise exception 'Only a Voltrix Coach account has a free trial.' using errcode = '42501';
  end if;
  if p.business_name is null then
    raise exception 'Name your business first.' using errcode = '22023';
  end if;
  if p.free_access or p.is_admin then
    return null;
  end if;
  if p.trial_ends_at > now() then
    return p.trial_ends_at;
  end if;
  if p.subscription_status <> 'none' then
    raise exception 'Your plan has ended. Subscribe again to carry on.' using errcode = '22023';
  end if;
  update public.profiles x
     set trial_ends_at = now() + interval '14 days'
   where x.id = me
  returning x.trial_ends_at into ends;
  return ends;
end;
$$;

revoke execute on function public.start_my_trial() from public, anon;
grant execute on function public.start_my_trial() to authenticated;

comment on column public.profiles.trial_ends_at is
  'End of the 14-day free trial. Set by start_my_trial() until card payments are connected.';

-- ---------- 2. Archived clients who still owe ----------

-- The signed-in trainer's archived clients who still owe something, by the rule of owed_items()
-- and money_totals(): sessions done (and no-shows while the trainer charges for them) with a
-- price, not on a pack and not paid, and packs with a price that aren't paid. Who owes you lists
-- them with everyone else, so it agrees with Earnings' "Owed to you now".
create function public.archived_owing()
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select c.id
    from public.clients c
    join public.profiles p on p.id = c.trainer_id
   where c.trainer_id = auth.uid()
     and c.status = 'archived'
     and (exists (select 1 from public.sessions s
                   where s.client_id = c.id
                     and s.trainer_id = c.trainer_id
                     and s.pack_id is null
                     and s.paid_on is null
                     and s.price_cents > 0
                     and (s.status = 'completed' or (s.status = 'no_show' and p.charge_no_shows)))
          or exists (select 1 from public.session_packs k
                      where k.client_id = c.id
                        and k.trainer_id = c.trainer_id
                        and k.paid_on is null
                        and k.price_cents > 0))
   order by c.id
   limit 200;
$$;

revoke execute on function public.archived_owing() from public, anon;
grant execute on function public.archived_owing() to authenticated;

-- ---------- 3. Live news for clients: pack changes too ----------

-- As in round 2, plus pack_id: a session moved on or off a pack changes the client's pack count
-- (my_packs), so their open Voltrix app reloads it. pack_id carries no price.
create or replace function public.sessions_news()
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
     where (n.client_id, n.starts_at, n.duration_minutes, n.location, n.status, n.online, n.pack_id)
           is distinct from (o.client_id, o.starts_at, o.duration_minutes, o.location, o.status, o.online, o.pack_id);
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

-- ---------- 4. Blocking settles a waiting request to train ----------

-- When someone blocks the trainer they asked to train them, their waiting request is withdrawn;
-- when a trainer blocks someone who asked them (from a comment or a reel, say), the request is
-- declined, as Decline with block does. Either way the note and phone number it carried are
-- cleared, the trainer's open app updates, and someone a trainer turned down hears the answer.
-- A request waiting more than 14 days had expired already and is marked so.
create function public.user_blocks_settle_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.training_requests;
  tname text;
begin
  for q in
    update public.training_requests x
       set status = case when x.created_at <= now() - interval '14 days' then 'expired'
                         when x.user_id = new.blocker_id then 'withdrawn'
                         else 'declined' end,
           answered_at = now(), note = null, phone = null
     where x.status = 'pending'
       and ((x.user_id = new.blocker_id and x.trainer_id = new.blocked_id)
            or (x.trainer_id = new.blocker_id and x.user_id = new.blocked_id))
    returning x.*
  loop
    perform public.news_settled(q.trainer_id, 'training_request', q.id, true);
    if q.status = 'declined' then
      select coalesce(nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), ''), p.business_name) into tname
        from public.profiles p where p.id = q.trainer_id;
      perform public.tell(q.user_id, 'training_answered', null,
        jsonb_build_object('request_id', q.id, 'accepted', false, 'trainer_id', q.trainer_id, 'trainer_name', tname));
    end if;
  end loop;
  return null;
end;
$$;

revoke execute on function public.user_blocks_settle_requests() from public, anon, authenticated;

create trigger user_blocks_settle_requests after insert on public.user_blocks
  for each row execute function public.user_blocks_settle_requests();

-- ---------- 5. Chat photos a person sent, also in chats that have ended ----------

-- Each person sees the chat photos they sent themselves, so they can remove them (the Storage API
-- reads a file back as it removes it) once the chat has ended too: the client left or was
-- archived, which hides the chat from both. Photos in a chat that is still going stay visible to
-- both people as before (chat_files_select).
create policy chat_files_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'chat' and owner_id = (select auth.uid())::text);

-- The chat photos the signed-in person sent, in every chat, also ones that have ended: what both
-- apps remove before an account is deleted (people may remove their own, chat_files_delete).
create function public.my_chat_photos()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
    from storage.objects o
   where auth.uid() is not null
     and o.bucket_id = 'chat'
     and o.owner_id = auth.uid()::text
   order by o.name
   limit 5000;
$$;

revoke execute on function public.my_chat_photos() from public, anon;
grant execute on function public.my_chat_photos() to authenticated;

-- ---------- 6. Profile photos are this project's own ----------

-- Both apps store the public address of the photo uploaded to the person's own folder in the
-- avatars bucket. Anything else (another server, a file: address) would make every phone that
-- shows the person load it, so it is refused.
alter table public.profiles
  add constraint profiles_avatar_url_own_check check (
    avatar_url is null
    or avatar_url ~ ('^https://[a-z0-9]{20}\.supabase\.co/storage/v1/object/public/avatars/'
                     || id::text || '/[A-Za-z0-9._-]{1,200}$'));
