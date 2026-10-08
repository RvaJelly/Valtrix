-- Chat and calls between a trainer (Voltrix Coach) and their client (Voltrix),
-- like WhatsApp (Ryan, 2026-10-08: "with the messages link the 2 apps so they
-- can talk and call almost like whatsapp").
--
-- A chat is one trainer-client link: a row in public.clients whose client has
-- signed up (user_id is set) and isn't archived. Messages and call updates reach
-- the apps live through Supabase Realtime: the database sends them to each
-- person's private "inbox:<user id>" channel. The apps also use "chat:<chat id>"
-- for typing and "call:<call id>" to connect a call.

-- ---------- Who is in a chat ----------

-- 'trainer' or 'client' when the signed-in person is in this chat, otherwise null.
create function public.chat_role(p_chat uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.trainer_id = auth.uid() then 'trainer' else 'client' end
    from public.clients c
   where c.id = p_chat
     and c.user_id is not null
     and c.status <> 'archived'
     and (c.trainer_id = auth.uid() or c.user_id = auth.uid());
$$;

revoke execute on function public.chat_role(uuid) from public, anon;
grant execute on function public.chat_role(uuid) to authenticated;

create function public.is_chat_member(p_chat uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.chat_role(p_chat) is not null;
$$;

revoke execute on function public.is_chat_member(uuid) from public, anon;
grant execute on function public.is_chat_member(uuid) to authenticated;

-- The chat a storage path or channel name points at, if it is a real chat id.
create function public.uuid_or_null(p_text text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_text::uuid end;
$$;

-- ---------- Tables ----------

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.clients (id) on delete cascade,
  caller_id uuid not null references public.profiles (id) on delete cascade,
  callee_id uuid not null references public.profiles (id) on delete cascade,
  video boolean not null default false,
  status text not null default 'ringing'
    check (status in ('ringing', 'accepted', 'declined', 'missed', 'cancelled', 'busy', 'ended')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz
);

create index calls_chat_idx on public.calls (chat_id, created_at desc);
create index calls_caller_idx on public.calls (caller_id);
create index calls_callee_idx on public.calls (callee_id);
create index calls_open_idx on public.calls (status) where status in ('ringing', 'accepted');

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.clients (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null default 'text' check (kind in ('text', 'image', 'call')),
  body text check (body is null or char_length(body) between 1 and 4000),
  -- Photos live in the private "chat" bucket under the chat's folder.
  media_path text check (media_path is null or char_length(media_path) between 1 and 300),
  -- Calls show in the chat like WhatsApp ("Missed voice call", "Video call 3:12").
  call_id uuid references public.calls (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- When the other person saw it (two blue ticks).
  read_at timestamptz,
  check (
    (kind = 'text' and body is not null and media_path is null and call_id is null)
    or (kind = 'image' and media_path is not null and call_id is null)
    or (kind = 'call' and call_id is not null and body is null and media_path is null)
  )
);

create index messages_chat_idx on public.messages (chat_id, created_at desc);
create index messages_unread_idx on public.messages (chat_id, sender_id) where read_at is null;
create index messages_sender_idx on public.messages (sender_id);
create index messages_call_idx on public.messages (call_id) where call_id is not null;

-- The server decides the time, and new messages start unread.
create function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  if new.kind <> 'call' then
    new.read_at := null;
  end if;
  return new;
end;
$$;

create trigger messages_before_insert before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ---------- Row level security ----------

alter table public.messages enable row level security;
alter table public.calls enable row level security;

revoke all on public.messages, public.calls from anon, authenticated;
grant select, delete on public.messages to authenticated;
-- The app picks the id so a message it shows straight away can be matched with the saved one.
grant insert (id, chat_id, kind, body, media_path) on public.messages to authenticated;
grant select on public.calls to authenticated;

create policy messages_select_member on public.messages
  for select to authenticated using ((select public.is_chat_member(chat_id)));

create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind in ('text', 'image')
    and (select public.is_chat_member(chat_id))
    and (media_path is null or split_part(media_path, '/', 1) = chat_id::text)
  );

-- Delete for everyone, like WhatsApp: people can remove their own messages.
create policy messages_delete_own on public.messages
  for delete to authenticated using (sender_id = (select auth.uid()) and kind <> 'call');

create policy calls_select_own on public.calls
  for select to authenticated
  using (caller_id = (select auth.uid()) or callee_id = (select auth.uid()));

-- ---------- Live updates ----------

-- Sends an event to someone's private inbox channel. Best effort: what was saved stays saved.
create function public.send_to_inbox(p_person uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_person is not null then
    perform realtime.send(p_payload, p_event, 'inbox:' || p_person::text, true);
  end if;
exception when others then
  raise warning 'Could not send % to inbox: %', p_event, sqlerrm;
end;
$$;

revoke execute on function public.send_to_inbox(uuid, text, jsonb) from public, anon, authenticated;

-- A message as the apps show it, with its call when it is one.
create function public.message_payload(m public.messages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(m) || jsonb_build_object(
    'call', (select jsonb_build_object('id', k.id, 'video', k.video, 'status', k.status, 'caller_id', k.caller_id,
                                       'answered_at', k.answered_at, 'ended_at', k.ended_at)
               from public.calls k where k.id = m.call_id));
$$;

revoke execute on function public.message_payload(public.messages) from public, anon, authenticated;

-- Tells both people in the chat (on every phone they use) about a change.
create function public.send_to_chat(p_chat uuid, p_event text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  link record;
begin
  select trainer_id, user_id into link from public.clients where id = p_chat;
  if not found then
    return;
  end if;
  perform public.send_to_inbox(link.trainer_id, p_event, p_payload);
  if link.user_id is distinct from link.trainer_id then
    perform public.send_to_inbox(link.user_id, p_event, p_payload);
  end if;
end;
$$;

revoke execute on function public.send_to_chat(uuid, text, jsonb) from public, anon, authenticated;

create function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.send_to_chat(new.chat_id, 'message', public.message_payload(new));
  return null;
end;
$$;

revoke execute on function public.messages_after_insert() from public, anon, authenticated;

create trigger messages_after_insert after insert on public.messages
  for each row execute function public.messages_after_insert();

create function public.messages_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.send_to_chat(old.chat_id, 'message_deleted', jsonb_build_object('id', old.id, 'chat_id', old.chat_id));
  return null;
end;
$$;

revoke execute on function public.messages_after_delete() from public, anon, authenticated;

create trigger messages_after_delete after delete on public.messages
  for each row execute function public.messages_after_delete();

-- Marks the other person's messages in a chat as read (blue ticks for them).
create function public.mark_chat_read(p_chat uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  seen_at timestamptz := now();
  marked integer;
begin
  if not public.is_chat_member(p_chat) then
    raise exception 'You are not in this chat' using errcode = '42501';
  end if;
  update public.messages
     set read_at = seen_at
   where chat_id = p_chat
     and sender_id <> me
     and read_at is null;
  get diagnostics marked = row_count;
  if marked > 0 then
    perform public.send_to_chat(p_chat, 'read',
      jsonb_build_object('chat_id', p_chat, 'reader_id', me, 'read_at', seen_at));
  end if;
  return marked;
end;
$$;

revoke execute on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- ---------- Chat list ----------

-- The signed-in person's chats, newest first, with the last message and unread count.
-- p_as is 'trainer' in Voltrix Coach and 'client' in Voltrix, so each app only shows
-- its own side (a trainer can sign in to both).
create function public.my_chats(p_as text)
returns table (
  chat_id uuid,
  other_id uuid,
  other_name text,
  other_avatar text,
  last_id uuid,
  last_kind text,
  last_body text,
  last_sender_id uuid,
  last_read_at timestamptz,
  last_at timestamptz,
  last_call_video boolean,
  last_call_status text,
  last_call_answered_at timestamptz,
  last_call_ended_at timestamptz,
  unread bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         case when p_as = 'trainer' then c.user_id else c.trainer_id end,
         case when p_as = 'trainer'
              then coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), cp.full_name, 'Client')
              else coalesce(nullif(trim(tp.full_name), ''), tp.business_name, 'Your trainer') end,
         case when p_as = 'trainer' then cp.avatar_url else tp.avatar_url end,
         m.id, m.kind, m.body, m.sender_id, m.read_at, m.created_at,
         k.video, k.status, k.answered_at, k.ended_at,
         (select count(*) from public.messages u
           where u.chat_id = c.id and u.sender_id <> auth.uid() and u.read_at is null)
    from public.clients c
    join public.profiles tp on tp.id = c.trainer_id
    join public.profiles cp on cp.id = c.user_id
    left join lateral (
      select * from public.messages x where x.chat_id = c.id order by x.created_at desc limit 1
    ) m on true
    left join public.calls k on k.id = m.call_id
   where auth.uid() is not null
     and c.status <> 'archived'
     and ((p_as = 'trainer' and c.trainer_id = auth.uid()) or (p_as = 'client' and c.user_id = auth.uid()))
   order by coalesce(m.created_at, c.created_at) desc;
$$;

revoke execute on function public.my_chats(text) from public, anon;
grant execute on function public.my_chats(text) to authenticated;

-- ---------- Calls ----------

-- A call as the apps need it: who is calling, as the person being called sees them.
create function public.call_payload(k public.calls)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(k) || jsonb_build_object(
    'callee_role', case when k.callee_id = c.trainer_id then 'trainer' else 'client' end,
    'caller_name', case when k.caller_id = c.trainer_id
                        then coalesce(nullif(trim(tp.full_name), ''), tp.business_name, 'Your trainer')
                        else coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), cp.full_name, 'Client') end,
    'caller_avatar', case when k.caller_id = c.trainer_id then tp.avatar_url else cp.avatar_url end,
    'callee_name', case when k.callee_id = c.trainer_id
                        then coalesce(nullif(trim(tp.full_name), ''), tp.business_name, 'Your trainer')
                        else coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), cp.full_name, 'Client') end,
    'callee_avatar', case when k.callee_id = c.trainer_id then tp.avatar_url else cp.avatar_url end)
    from public.clients c
    join public.profiles tp on tp.id = c.trainer_id
    left join public.profiles cp on cp.id = c.user_id
   where c.id = k.chat_id;
$$;

revoke execute on function public.call_payload(public.calls) from public, anon, authenticated;

create function public.announce_call(k public.calls)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb := public.call_payload(k);
begin
  perform public.send_to_inbox(k.caller_id, 'call', payload);
  if k.callee_id <> k.caller_id then
    perform public.send_to_inbox(k.callee_id, 'call', payload);
  end if;
end;
$$;

revoke execute on function public.announce_call(public.calls) from public, anon, authenticated;

-- Ends a call that is still ringing or going, and adds it to the chat.
create function public.finish_call(p_call uuid, p_status text)
returns public.calls
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.calls;
begin
  update public.calls
     set status = p_status, ended_at = now()
   where id = p_call
     and status in ('ringing', 'accepted')
  returning * into k;
  if not found then
    select * into k from public.calls where id = p_call;
    return k;
  end if;
  -- The person called has seen calls they answered or declined; the rest show as missed.
  insert into public.messages (chat_id, sender_id, kind, call_id, read_at)
  values (k.chat_id, k.caller_id, 'call', k.id,
          case when k.status in ('ended', 'declined') then now() end);
  perform public.announce_call(k);
  return k;
end;
$$;

revoke execute on function public.finish_call(uuid, text) from public, anon, authenticated;

-- Starts a voice or video call in a chat. Returns the call; its status is 'busy'
-- straight away when the other person is already on a call.
create function public.start_call(p_chat uuid, p_video boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  link public.clients;
  other uuid;
  stale record;
  k public.calls;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into link from public.clients
   where id = p_chat and user_id is not null and status <> 'archived'
     and (trainer_id = me or user_id = me);
  if not found then
    raise exception 'You can only call people you chat with' using errcode = '42501';
  end if;
  if link.trainer_id = link.user_id then
    raise exception 'You can''t call yourself' using errcode = '22023';
  end if;
  other := case when link.trainer_id = me then link.user_id else link.trainer_id end;

  -- Tidy up calls that can't still be going: unanswered after a minute, my own
  -- earlier calls (I'm starting a new one, so I've left them), and calls that
  -- have been "on" for over 4 hours because an app closed without hanging up.
  for stale in
    select id, status, caller_id from public.calls
     where status in ('ringing', 'accepted')
       and (caller_id in (me, other) or callee_id in (me, other))
       and (caller_id = me or callee_id = me
            or (status = 'ringing' and created_at < now() - interval '60 seconds')
            or (status = 'accepted' and answered_at < now() - interval '4 hours'))
  loop
    perform public.finish_call(stale.id,
      case when stale.status = 'accepted' then 'ended'
           when stale.caller_id = me then 'cancelled'
           else 'missed' end);
  end loop;

  insert into public.calls (chat_id, caller_id, callee_id, video)
  values (p_chat, me, other, coalesce(p_video, false))
  returning * into k;

  if exists (select 1 from public.calls
              where id <> k.id and status in ('ringing', 'accepted')
                and (caller_id = other or callee_id = other)) then
    k := public.finish_call(k.id, 'busy');
  else
    perform public.announce_call(k);
  end if;
  return public.call_payload(k);
end;
$$;

revoke execute on function public.start_call(uuid, boolean) from public, anon;
grant execute on function public.start_call(uuid, boolean) to authenticated;

-- Answer, decline, cancel or hang up. 'missed' is the caller giving up after ringing.
-- Returns the call as it is now, changed or not.
create function public.update_call(p_call uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  k public.calls;
begin
  select * into k from public.calls where id = p_call and (caller_id = me or callee_id = me) for update;
  if not found then
    raise exception 'Call not found' using errcode = '42501';
  end if;

  if p_action = 'accept' then
    if k.callee_id = me and k.status = 'ringing' then
      if k.created_at < now() - interval '60 seconds' then
        k := public.finish_call(k.id, 'missed');
      else
        update public.calls set status = 'accepted', answered_at = now() where id = k.id returning * into k;
        perform public.announce_call(k);
      end if;
    end if;
  elsif p_action = 'decline' then
    if k.callee_id = me and k.status = 'ringing' then
      k := public.finish_call(k.id, 'declined');
    end if;
  elsif p_action in ('cancel', 'missed') then
    if k.caller_id = me and k.status = 'ringing' then
      k := public.finish_call(k.id, case when p_action = 'missed' then 'missed' else 'cancelled' end);
    end if;
  elsif p_action = 'end' then
    if k.status = 'accepted' then
      k := public.finish_call(k.id, 'ended');
    elsif k.status = 'ringing' then
      k := public.finish_call(k.id, case when k.caller_id = me then 'cancelled' else 'declined' end);
    end if;
  else
    raise exception 'Unknown call action %', p_action using errcode = '22023';
  end if;
  return public.call_payload(k);
end;
$$;

revoke execute on function public.update_call(uuid, text) from public, anon;
grant execute on function public.update_call(uuid, text) to authenticated;

-- ---------- Realtime channels ----------

-- Who may listen to or send on a private channel:
--   inbox:<user id>  only that person listens; only the database sends.
--   chat:<chat id>   both people in the chat (typing).
--   call:<call id>   the two people on a call that is ringing or going.
create function public.can_use_channel(p_topic text, p_sending boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  kind text := split_part(p_topic, ':', 1);
  target uuid := public.uuid_or_null(split_part(p_topic, ':', 2));
begin
  if me is null or target is null then
    return false;
  end if;
  if kind = 'inbox' then
    return not p_sending and target = me;
  elsif kind = 'chat' then
    return public.is_chat_member(target);
  elsif kind = 'call' then
    return exists (select 1 from public.calls k
                    where k.id = target and (k.caller_id = me or k.callee_id = me)
                      and k.status in ('ringing', 'accepted'));
  end if;
  return false;
end;
$$;

revoke execute on function public.can_use_channel(text, boolean) from public, anon;
grant execute on function public.can_use_channel(text, boolean) to authenticated;

create policy voltrix_channels_listen on realtime.messages
  for select to authenticated
  using (extension in ('broadcast', 'presence') and (select public.can_use_channel(realtime.topic(), false)));

create policy voltrix_channels_send on realtime.messages
  for insert to authenticated
  with check (extension in ('broadcast', 'presence') and (select public.can_use_channel(realtime.topic(), true)));

-- ---------- Photos ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Both people in a chat can see and add photos in its folder. People remove their
-- own photos; the trainer can clear the whole folder when deleting their account.
create policy chat_files_select on storage.objects
  for select to authenticated
  using (bucket_id = 'chat' and public.chat_role(public.uuid_or_null((storage.foldername(name))[1])) is not null);

create policy chat_files_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat' and public.chat_role(public.uuid_or_null((storage.foldername(name))[1])) is not null);

create policy chat_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat'
    and (owner_id = (select auth.uid())::text
         or public.chat_role(public.uuid_or_null((storage.foldername(name))[1])) = 'trainer')
  );
