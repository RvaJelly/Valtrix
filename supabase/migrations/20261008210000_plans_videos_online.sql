-- Workout plans per client, workout videos and online sessions (Ryan, 2026-10-08:
-- "they must be able to set the personal trainer like a clients ... workout plan under
-- that user name or client", "we need somthing so they can online videos 2 and make
-- nsure i can download them on mobile").
--
-- A trainer puts workouts from their library into a client's plan, on chosen weekdays
-- or "any day". The client sees the plan in the Voltrix app, ticks workouts off, and
-- can watch and save the videos the trainer added. Sessions can be online, and both
-- apps then offer a video call around the start time.
--
-- Clients read plans only through my_plan() and my_plan_workout(), and only for
-- trainers they are linked to, so other workouts and the trainer's notes on clients
-- stay hidden.

-- ---------- Online sessions ----------

alter table public.sessions add column if not exists online boolean not null default false;

grant insert (online), update (online) on public.sessions to authenticated;

-- ---------- Videos on exercises and workouts ----------

-- Each video lives in the private "workout-videos" bucket, in the trainer's own folder.
-- An exercise's video is its demo everywhere it is used; a video on a workout's
-- exercise row is a demo for that workout only (it also works for built-in exercises);
-- a workout's own video is for the whole workout, like a follow-along.
alter table public.exercises
  add column if not exists video_path text
    constraint exercises_video_path_check check (
      video_path is null
      or (trainer_id is not null and char_length(video_path) <= 300 and split_part(video_path, '/', 1) = trainer_id::text)
    );

alter table public.workouts
  add column if not exists video_path text
    constraint workouts_video_path_check check (
      video_path is null
      or (char_length(video_path) <= 300 and split_part(video_path, '/', 1) = trainer_id::text)
    );

alter table public.workout_exercises
  add column if not exists video_path text
    constraint workout_exercises_video_path_check check (video_path is null or char_length(video_path) between 1 and 300);

grant insert (video_path), update (video_path) on public.exercises to authenticated;
grant insert (video_path), update (video_path) on public.workouts to authenticated;
-- workout_exercises already allows every column.

-- A workout's exercise rows can only point at videos in the workout owner's folder.
create function public.workout_exercises_check_video()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.video_path is not null and not exists (
    select 1 from public.workouts w
     where w.id = new.workout_id and split_part(new.video_path, '/', 1) = w.trainer_id::text
  ) then
    raise exception 'Videos must be in the trainer''s own folder' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.workout_exercises_check_video() from public, anon, authenticated;

create trigger workout_exercises_check_video before insert or update of video_path, workout_id on public.workout_exercises
  for each row execute function public.workout_exercises_check_video();

-- ---------- Plans ----------

-- One workout in a client's plan.
create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  position int not null default 0 check (position >= 0),
  -- Days of the week, 1 = Monday to 7 = Sunday. Empty means any day, once a week.
  weekdays smallint[] not null default '{}'
    check (weekdays <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(weekdays) <= 7),
  -- A short note for the client, like "Go light this week".
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index plan_items_client_idx on public.plan_items (client_id, position);
create index plan_items_trainer_idx on public.plan_items (trainer_id);
create index plan_items_workout_idx on public.plan_items (workout_id);

create trigger plan_items_set_updated_at before update on public.plan_items
  for each row execute function public.set_updated_at();

-- The days a client ticked a plan workout off. One tick per workout per day.
create table public.plan_completions (
  plan_item_id uuid not null references public.plan_items (id) on delete cascade,
  -- The client's own date (their phone's day), so it matches their week.
  done_on date not null,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_item_id, done_on)
);

create index plan_completions_user_idx on public.plan_completions (user_id);

-- Is this plan workout for the signed-in person, from a trainer they are linked to?
create function public.is_my_plan_item(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.plan_items pi
      join public.clients c on c.id = pi.client_id
     where pi.id = p_item
       and c.user_id = auth.uid()
       and c.status <> 'archived'
       and c.trainer_id = pi.trainer_id
  );
$$;

revoke execute on function public.is_my_plan_item(uuid) from public, anon;
grant execute on function public.is_my_plan_item(uuid) to authenticated;

-- Is this plan workout one the signed-in trainer set? Plan rows are only visible to
-- their trainer, so this needs no extra rights.
create function public.owns_plan_item(p_item uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.plan_items where id = p_item and trainer_id = auth.uid());
$$;

revoke execute on function public.owns_plan_item(uuid) from public, anon;
grant execute on function public.owns_plan_item(uuid) to authenticated;

alter table public.plan_items enable row level security;
alter table public.plan_completions enable row level security;

revoke all on public.plan_items, public.plan_completions from anon, authenticated;
grant select, delete on public.plan_items to authenticated;
grant insert (client_id, workout_id, position, weekdays, note) on public.plan_items to authenticated;
grant update (position, weekdays, note) on public.plan_items to authenticated;
grant select, delete on public.plan_completions to authenticated;
grant insert (plan_item_id, done_on) on public.plan_completions to authenticated;

-- Trainers manage the plans of their own clients, with their own workouts.
create policy plan_items_select_own on public.plan_items
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy plan_items_insert_own on public.plan_items
  for insert to authenticated
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.owns_client(client_id))
    and (select public.owns_workout(workout_id))
  );
create policy plan_items_update_own on public.plan_items
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()));
create policy plan_items_delete_own on public.plan_items
  for delete to authenticated using (trainer_id = (select auth.uid()));

-- Clients tick off their own plan workouts, for today (a day either side allows for
-- time zones), and can untick them. Their trainer sees the ticks.
create policy plan_completions_select on public.plan_completions
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.owns_plan_item(plan_item_id)));
create policy plan_completions_insert_own on public.plan_completions
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.is_my_plan_item(plan_item_id))
    and done_on between (now() at time zone 'utc')::date - 1 and (now() at time zone 'utc')::date + 1
  );
create policy plan_completions_delete_own on public.plan_completions
  for delete to authenticated using (user_id = (select auth.uid()));

-- The signed-in client's plan from all their trainers, with the days each workout
-- was ticked off between two dates (at most about two months apart).
create function public.my_plan(p_from date, p_to date)
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
  done_on date[]
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
                    where d.plan_item_id = pi.id and d.done_on between p_from and p_to), '{}')
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

-- The exercises of one workout in the signed-in client's plan, in order, with the
-- video to show for each (the workout's own one first, then the exercise's).
create function public.my_plan_workout(p_item uuid)
returns table (
  id uuid,
  "position" int,
  exercise_name text,
  muscle_group text,
  equipment text,
  instructions text,
  sets int,
  reps text,
  weight text,
  rest_seconds int,
  notes text,
  video_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select we.id, we.position, e.name, e.muscle_group, e.equipment, e.instructions,
         we.sets, we.reps, we.weight, we.rest_seconds, we.notes,
         coalesce(we.video_path, case when e.trainer_id = pi.trainer_id then e.video_path end)
    from public.plan_items pi
    join public.workouts w on w.id = pi.workout_id and w.trainer_id = pi.trainer_id
    join public.workout_exercises we on we.workout_id = w.id
    join public.exercises e on e.id = we.exercise_id
   where pi.id = p_item
     and public.is_my_plan_item(p_item)
   order by we.position;
$$;

revoke execute on function public.my_plan_workout(uuid) from public, anon;
grant execute on function public.my_plan_workout(uuid) to authenticated;

-- ---------- Sessions in the client app ----------

-- Like my_sessions(), plus whether the session is online and the chat (client row)
-- to start the video call in, and the trainer's photo for the call screen.
-- my_sessions() stays for app versions already on phones.
create function public.my_sessions_v2(range_start timestamptz, range_end timestamptz)
returns table (
  id uuid,
  starts_at timestamptz,
  duration_minutes int,
  location text,
  status text,
  trainer_name text,
  business_name text,
  online boolean,
  client_id uuid,
  trainer_avatar text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.duration_minutes, s.location, s.status, p.full_name, p.business_name,
         s.online, c.id, p.avatar_url
    from public.sessions s
    join public.clients c on c.id = s.client_id
    join public.profiles p on p.id = s.trainer_id
   where c.user_id = auth.uid()
     and c.status <> 'archived'
     and s.starts_at >= range_start
     and s.starts_at < range_end
     and range_end - range_start <= interval '400 days'
   order by s.starts_at;
$$;

revoke execute on function public.my_sessions_v2(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_sessions_v2(timestamptz, timestamptz) to authenticated;

-- ---------- Video files ----------

-- Up to 50 MB each, the most the Supabase free plan allows per file. Private: people
-- get a short-lived link to watch or save a video.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workout-videos', 'workout-videos', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

-- Can the signed-in person watch this video? Yes when it belongs to a workout in their
-- plan: the workout's own video, a video on one of its exercise rows, or the demo of
-- one of its exercises. The video must be in the folder of the trainer who set the plan.
create function public.can_watch_workout_video(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.plan_items pi
      join public.clients c on c.id = pi.client_id
      join public.workouts w on w.id = pi.workout_id
     where c.user_id = auth.uid()
       and c.status <> 'archived'
       and c.trainer_id = pi.trainer_id
       and w.trainer_id = pi.trainer_id
       and split_part(p_name, '/', 1) = pi.trainer_id::text
       and (
         w.video_path = p_name
         or exists (
           select 1
             from public.workout_exercises we
             left join public.exercises e on e.id = we.exercise_id and e.trainer_id = pi.trainer_id
            where we.workout_id = w.id
              and (we.video_path = p_name or e.video_path = p_name)
         )
       )
  );
$$;

revoke execute on function public.can_watch_workout_video(text) from public, anon;
grant execute on function public.can_watch_workout_video(text) to authenticated;

-- Trainers add and remove videos in their own folder, and see them all. Clients see
-- the videos of workouts in their plan.
create policy workout_videos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workout-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_trainer())
  );

create policy workout_videos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'workout-videos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy workout_videos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'workout-videos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_watch_workout_video(name))
  );
