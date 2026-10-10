-- Round 1 of "all the ideas to make Voltrix better" (Ryan, 2026-10-09: he approved them all):
-- workout mode, progress tracking and daily habits in Voltrix, and a read-only view of all of
-- it for the client's trainers in Voltrix Coach.
--
--   * Workouts: a client starts a workout from their plan, logs the weight and reps they
--     really did for each set, and finishes it (finish_workout). Finishing ticks the plan
--     workout off for that day, like the tick on the plan. Personal bests (heaviest weight,
--     best estimated one-rep max, and most reps in a set without weights) are worked out from
--     the saved sets.
--   * Progress: body weight on any day, body measurements, progress photos (front, side and
--     back, in a private bucket) and a weekly check-in that each of the client's trainers can
--     read and reply to.
--   * Habits: water, steps and sleep for each day, against the client's own targets.
--
-- Weights are kept in kg and lengths in cm, with enough decimals that a number typed in lb or
-- inches shows the same again. Days are the client's own date (their phone's day), like the
-- food diary.
--
-- Everyone reads and writes only their own logs. A trainer reads a client's logs only through
-- the client_* functions below, by the same rule as client_food_diary(): the trainer's own
-- client row, not archived, linked to the person. The link (clients.user_id) is set only once
-- the person accepts the trainer, and leaving clears it at once, so a trainer the person left
-- sees nothing more. As with the food diary, a block hides social posts only (20261009143721)
-- and a trainer whose plan lapsed can still read; writing a reply is like a chat message.
--
-- The free trial for new trainers is 14 days now (it was 3). The billing server sets
-- trial_ends_at when a trainer adds their card, so only the column's description changes here.

comment on column public.profiles.trial_ends_at is
  'End of the 14-day free trial. Set by the billing server when the trainer adds their card.';

-- ---------- Who may read a client's logs ----------

-- The person behind one of the signed-in trainer's clients, when the trainer may read their
-- logs: the rule client_food_diary() uses. user_id is only set while the person has accepted
-- (invite_status 'joined', 20261009173917), and the row stays locked to that person
-- (last_user_id), which is checked here too in case that trigger ever changes. Null for
-- anyone else's client, an archived one, or one not linked now.
create function public.coached_user(p_client uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.user_id
    from public.clients c
   where auth.uid() is not null
     and c.id = p_client
     and c.trainer_id = auth.uid()
     and c.status <> 'archived'
     and c.invite_status = 'joined'
     and c.user_id is not null
     and c.last_user_id = c.user_id;
$$;

revoke execute on function public.coached_user(uuid) from public, anon, authenticated;

-- Does the signed-in trainer coach this person now, by the same rule? For photo files, which
-- are found by the person's id rather than a client row.
create function public.coaches_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.clients c
     where auth.uid() is not null
       and c.trainer_id = auth.uid()
       and c.user_id = p_user
       and c.status <> 'archived'
       and c.invite_status = 'joined'
       and c.last_user_id = c.user_id
  );
$$;

revoke execute on function public.coaches_user(uuid) from public, anon, authenticated;

-- ---------- Workouts ----------

-- One finished workout. The app picks the id when the workout starts, so saving it twice (a
-- retry after a lost connection) keeps one.
create table public.workout_logs (
  id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The plan workout it was started from. The log stays when the trainer takes it off the plan.
  plan_item_id uuid references public.plan_items (id) on delete set null,
  workout_name text not null check (char_length(btrim(workout_name)) between 1 and 120),
  -- The client's own date when they started it.
  day date not null check (day >= date '2020-01-01'),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  -- "How did it go?", which their trainers see.
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint workout_logs_length_check check (finished_at >= started_at and finished_at - started_at <= interval '24 hours')
);

create index workout_logs_user_finished_idx on public.workout_logs (user_id, finished_at desc);
create index workout_logs_user_day_idx on public.workout_logs (user_id, day);
-- For the limit on workouts saved in any 24 hours.
create index workout_logs_user_created_idx on public.workout_logs (user_id, created_at desc);
create index workout_logs_plan_item_idx on public.workout_logs (plan_item_id) where plan_item_id is not null;

-- The sets of a workout, in order. Only the sets the client ticked off are saved.
create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.workout_logs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The exercise's place in the workout (0 first) and its name at the time. Personal bests go
  -- by name in any case, so the same exercise in two workouts, or from two trainers, counts once.
  position smallint not null check (position between 0 and 49),
  exercise_name text not null check (char_length(btrim(exercise_name)) between 1 and 120),
  set_number smallint not null check (set_number between 1 and 30),
  -- Null weight for a set without weights (bodyweight). Both are null for a set that was
  -- just done, with nothing to count (a plank held for 30 s, a stretch).
  weight_kg numeric(8, 3) check (weight_kg is null or weight_kg between 0 and 1000),
  reps smallint check (reps is null or reps between 0 and 1000),
  unique (log_id, position, set_number)
);

create index workout_sets_user_exercise_idx on public.workout_sets (user_id, lower(btrim(exercise_name)));

-- ---------- Body ----------

-- One body weight a day.
create table public.body_weights (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  weight_kg numeric(6, 3) not null check (weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger body_weights_set_updated_at before update on public.body_weights
  for each row execute function public.set_updated_at();

-- Body measurements, one set a day. Any of them can be left out, but not all.
create table public.body_measurements (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  waist_cm numeric(5, 2) check (waist_cm is null or waist_cm between 20 and 300),
  hips_cm numeric(5, 2) check (hips_cm is null or hips_cm between 20 and 300),
  chest_cm numeric(5, 2) check (chest_cm is null or chest_cm between 20 and 300),
  arm_cm numeric(5, 2) check (arm_cm is null or arm_cm between 10 and 150),
  thigh_cm numeric(5, 2) check (thigh_cm is null or thigh_cm between 10 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint body_measurements_something_check check (num_nonnulls(waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm) > 0)
);

create trigger body_measurements_set_updated_at before update on public.body_measurements
  for each row execute function public.set_updated_at();

-- Progress photos: front, side and back, one of each a day. The file is in the private
-- "progress-photos" bucket, in the person's own folder ("<user id>/<name>.jpg").
create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null check (day >= date '2000-01-01'),
  pose text not null check (pose in ('front', 'side', 'back')),
  path text not null unique
    constraint progress_photos_path_check check (
      path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$'
      and split_part(path, '/', 1) = user_id::text
    ),
  width int check (width is null or width between 1 and 10000),
  height int check (height is null or height between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day, pose)
);

create trigger progress_photos_set_updated_at before update on public.progress_photos
  for each row execute function public.set_updated_at();

-- ---------- Weekly check-ins ----------

-- How the client's week went, one check-in a week (they can change it). Ratings are 1 (bad)
-- to 5 (great); for stress, 5 is a lot of stress.
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The Monday of the client's week.
  week_start date not null
    constraint check_ins_week_start_check check (week_start >= date '2020-01-01' and extract(isodow from week_start) = 1),
  rating smallint not null check (rating between 1 and 5),
  energy smallint not null check (energy between 1 and 5),
  sleep smallint not null check (sleep between 1 and 5),
  stress smallint not null check (stress between 1 and 5),
  wins text check (wins is null or char_length(wins) <= 1000),
  struggles text check (struggles is null or char_length(struggles) <= 1000),
  weight_kg numeric(6, 3) check (weight_kg is null or weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create trigger check_ins_set_updated_at before update on public.check_ins
  for each row execute function public.set_updated_at();

-- A trainer's reply to a check-in: one each, which they can change. Written only through
-- reply_to_check_in(); clients read them through my_check_ins().
create table public.check_in_replies (
  id uuid primary key default gen_random_uuid(),
  check_in_id uuid not null references public.check_ins (id) on delete cascade,
  trainer_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (check_in_id, trainer_id)
);

create index check_in_replies_trainer_idx on public.check_in_replies (trainer_id);

create trigger check_in_replies_set_updated_at before update on public.check_in_replies
  for each row execute function public.set_updated_at();

-- ---------- Habits ----------

-- Water, steps and sleep for one day. Sleep is the night before the day.
create table public.habit_days (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day date not null check (day >= date '2020-01-01'),
  water_ml int not null default 0 check (water_ml between 0 and 20000),
  steps int not null default 0 check (steps between 0 and 200000),
  -- Null until it is logged.
  sleep_minutes int check (sleep_minutes is null or sleep_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create trigger habit_days_set_updated_at before update on public.habit_days
  for each row execute function public.set_updated_at();

-- The client's own daily targets. Without a row the apps use these defaults.
create table public.habit_targets (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  water_ml int not null default 2500 check (water_ml between 250 and 10000),
  steps int not null default 8000 check (steps between 500 and 100000),
  sleep_minutes int not null default 480 check (sleep_minutes between 180 and 960),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger habit_targets_set_updated_at before update on public.habit_targets
  for each row execute function public.set_updated_at();

-- ---------- Row level security ----------

alter table public.workout_logs enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_weights enable row level security;
alter table public.body_measurements enable row level security;
alter table public.progress_photos enable row level security;
alter table public.check_ins enable row level security;
alter table public.check_in_replies enable row level security;
alter table public.habit_days enable row level security;
alter table public.habit_targets enable row level security;

revoke all on public.workout_logs, public.workout_sets, public.body_weights, public.body_measurements,
  public.progress_photos, public.check_ins, public.check_in_replies, public.habit_days, public.habit_targets
  from anon, authenticated;

-- Workouts are saved only through finish_workout(), which checks them. A saved workout can
-- be removed (its sets go with it).
grant select, delete on public.workout_logs to authenticated;
grant select on public.workout_sets to authenticated;

-- An upsert from the app sets every column it sends, the day too, so day is in the update grants.
grant select, delete on public.body_weights to authenticated;
grant insert (day, weight_kg), update (day, weight_kg) on public.body_weights to authenticated;

grant select, delete on public.body_measurements to authenticated;
grant insert (day, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm),
  update (day, waist_cm, hips_cm, chest_cm, arm_cm, thigh_cm) on public.body_measurements to authenticated;

grant select, delete on public.progress_photos to authenticated;
grant insert (day, pose, path, width, height), update (day, pose, path, width, height)
  on public.progress_photos to authenticated;

grant select, delete on public.check_ins to authenticated;
grant insert (week_start, rating, energy, sleep, stress, wins, struggles, weight_kg),
  update (week_start, rating, energy, sleep, stress, wins, struggles, weight_kg) on public.check_ins to authenticated;

grant select, delete on public.check_in_replies to authenticated;

-- The app writes habits through log_habit(); day is in the update grant so a plain upsert
-- works too, as for body weights.
grant select, delete on public.habit_days to authenticated;
grant insert (day, water_ml, steps, sleep_minutes), update (day, water_ml, steps, sleep_minutes)
  on public.habit_days to authenticated;

grant select on public.habit_targets to authenticated;
grant insert (water_ml, steps, sleep_minutes), update (water_ml, steps, sleep_minutes)
  on public.habit_targets to authenticated;

-- Each person only ever touches their own logs, never for a day after tomorrow (a day ahead
-- allows for time zones).
create policy workout_logs_select_own on public.workout_logs
  for select to authenticated using (user_id = (select auth.uid()));
create policy workout_logs_delete_own on public.workout_logs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy workout_sets_select_own on public.workout_sets
  for select to authenticated using (user_id = (select auth.uid()));

create policy body_weights_select_own on public.body_weights
  for select to authenticated using (user_id = (select auth.uid()));
create policy body_weights_insert_own on public.body_weights
  for insert to authenticated
  with check (user_id = (select auth.uid()) and day <= (now() at time zone 'utc')::date + 1);
create policy body_weights_update_own on public.body_weights
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and day <= (now() at time zone 'utc')::date + 1);
create policy body_weights_delete_own on public.body_weights
  for delete to authenticated using (user_id = (select auth.uid()));

create policy body_measurements_select_own on public.body_measurements
  for select to authenticated using (user_id = (select auth.uid()));
create policy body_measurements_insert_own on public.body_measurements
  for insert to authenticated
  with check (user_id = (select auth.uid()) and day <= (now() at time zone 'utc')::date + 1);
create policy body_measurements_update_own on public.body_measurements
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and day <= (now() at time zone 'utc')::date + 1);
create policy body_measurements_delete_own on public.body_measurements
  for delete to authenticated using (user_id = (select auth.uid()));

create policy progress_photos_select_own on public.progress_photos
  for select to authenticated using (user_id = (select auth.uid()));
create policy progress_photos_insert_own on public.progress_photos
  for insert to authenticated
  with check (user_id = (select auth.uid()) and day <= (now() at time zone 'utc')::date + 1);
create policy progress_photos_update_own on public.progress_photos
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and day <= (now() at time zone 'utc')::date + 1);
create policy progress_photos_delete_own on public.progress_photos
  for delete to authenticated using (user_id = (select auth.uid()));

create policy check_ins_select_own on public.check_ins
  for select to authenticated using (user_id = (select auth.uid()));
create policy check_ins_insert_own on public.check_ins
  for insert to authenticated
  with check (user_id = (select auth.uid()) and week_start <= (now() at time zone 'utc')::date + 1);
create policy check_ins_update_own on public.check_ins
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and week_start <= (now() at time zone 'utc')::date + 1);
create policy check_ins_delete_own on public.check_ins
  for delete to authenticated using (user_id = (select auth.uid()));

-- Trainers see and remove their own replies.
create policy check_in_replies_select_own on public.check_in_replies
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy check_in_replies_delete_own on public.check_in_replies
  for delete to authenticated using (trainer_id = (select auth.uid()));

-- Habits for the last month, up to tomorrow.
create policy habit_days_select_own on public.habit_days
  for select to authenticated using (user_id = (select auth.uid()));
create policy habit_days_insert_own on public.habit_days
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and day between (now() at time zone 'utc')::date - 31 and (now() at time zone 'utc')::date + 1
  );
create policy habit_days_update_own on public.habit_days
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and day between (now() at time zone 'utc')::date - 31 and (now() at time zone 'utc')::date + 1
  );
create policy habit_days_delete_own on public.habit_days
  for delete to authenticated using (user_id = (select auth.uid()));

create policy habit_targets_select_own on public.habit_targets
  for select to authenticated using (user_id = (select auth.uid()));
create policy habit_targets_insert_own on public.habit_targets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy habit_targets_update_own on public.habit_targets
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- Live news for trainers ----------

-- Tells each of the person's trainers ('progress' on their inbox channel, with that trainer's
-- client row) that a workout, weight, measurements, photo or check-in was saved or removed,
-- so an open client page in Voltrix Coach shows it. Best effort, like messages. Habits change
-- with every tap of a button, so they send no news. Rows removed because the whole account
-- is being deleted (its profile is gone already) send nothing either.
create function public.progress_news()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  link record;
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.profiles p where p.id = person) then
    return null;
  end if;
  for link in
    select c.id, c.trainer_id
      from public.clients c
     where c.user_id = person
       and c.status <> 'archived'
  loop
    perform public.send_to_inbox(link.trainer_id, 'progress',
      jsonb_build_object('client_id', link.id, 'kind', tg_argv[0]));
  end loop;
  return null;
end;
$$;

revoke execute on function public.progress_news() from public, anon, authenticated;

create trigger workout_logs_news after insert or delete on public.workout_logs
  for each row execute function public.progress_news('workout');
create trigger body_weights_news after insert or update or delete on public.body_weights
  for each row execute function public.progress_news('weight');
create trigger body_measurements_news after insert or update or delete on public.body_measurements
  for each row execute function public.progress_news('measurements');
create trigger progress_photos_news after insert or update or delete on public.progress_photos
  for each row execute function public.progress_news('photo');
create trigger check_ins_news after insert or update or delete on public.check_ins
  for each row execute function public.progress_news('check_in');

-- ---------- Personal bests ----------

-- Each exercise's best in each of a person's workouts: the heaviest set (with the most reps at
-- that weight; a set of 0 reps is a failed lift and doesn't count, a weight with no reps, like
-- a carry or a hold, does), the best estimated one-rep max and the most reps in one set
-- without weights (so a light warm-up doesn't count as "most reps" on a weighted lift). The
-- one-rep max uses Epley's formula, weight × (1 + reps / 30), for 2 to 12 reps; a single is
-- its own weight. Only the functions below call it.
create function public.exercise_bests(p_user uuid)
returns table (
  exercise_key text,
  exercise_name text,
  log_id uuid,
  day date,
  finished_at timestamptz,
  top_weight_kg numeric,
  top_weight_reps int,
  top_e1rm_kg numeric,
  top_reps int
)
language sql
stable
set search_path = ''
as $$
  with sets as (
    select lower(btrim(s.exercise_name)) as exercise_key, s.exercise_name, s.set_number, s.log_id,
           l.day, l.finished_at, s.weight_kg, s.reps::int as reps,
           case
             when s.weight_kg > 0 and s.reps = 1 then s.weight_kg
             when s.weight_kg > 0 and s.reps between 2 and 12 then round(s.weight_kg * (1 + s.reps / 30.0), 3)
           end as e1rm
      from public.workout_sets s
      join public.workout_logs l on l.id = s.log_id
     where p_user is not null
       and s.user_id = p_user
       and l.user_id = p_user
  )
  select s.exercise_key,
         (array_agg(s.exercise_name order by s.set_number))[1],
         s.log_id, s.day, s.finished_at,
         max(s.weight_kg) filter (where s.weight_kg > 0 and (s.reps is null or s.reps > 0)),
         (array_agg(s.reps order by s.weight_kg desc, s.reps desc nulls last)
            filter (where s.weight_kg > 0 and (s.reps is null or s.reps > 0)))[1],
         max(s.e1rm),
         max(s.reps) filter (where s.reps > 0 and coalesce(s.weight_kg, 0) = 0)
    from sets s
   group by s.exercise_key, s.log_id, s.day, s.finished_at;
$$;

revoke execute on function public.exercise_bests(uuid) from public, anon, authenticated;

-- A person's best ever for each exercise, the exercise done most recently first. Ties go to
-- the first time it was reached.
create function public.personal_bests_for(p_user uuid)
returns table (
  exercise_name text,
  best_weight_kg numeric,
  best_weight_reps int,
  best_weight_on date,
  best_e1rm_kg numeric,
  best_e1rm_on date,
  most_reps int,
  most_reps_on date,
  last_done_on date,
  times_done int
)
language sql
stable
set search_path = ''
as $$
  select (array_agg(b.exercise_name order by b.finished_at desc))[1],
         max(b.top_weight_kg),
         (array_agg(b.top_weight_reps order by b.top_weight_kg desc nulls last, b.top_weight_reps desc nulls last, b.finished_at)
            filter (where b.top_weight_kg is not null))[1],
         (array_agg(b.day order by b.top_weight_kg desc nulls last, b.top_weight_reps desc nulls last, b.finished_at)
            filter (where b.top_weight_kg is not null))[1],
         max(b.top_e1rm_kg),
         (array_agg(b.day order by b.top_e1rm_kg desc nulls last, b.finished_at) filter (where b.top_e1rm_kg is not null))[1],
         max(b.top_reps),
         (array_agg(b.day order by b.top_reps desc nulls last, b.finished_at) filter (where b.top_reps is not null))[1],
         max(b.day),
         count(*)::int
    from public.exercise_bests(p_user) b
   group by b.exercise_key
   order by max(b.finished_at) desc;
$$;

revoke execute on function public.personal_bests_for(uuid) from public, anon, authenticated;

-- The times a person beat one of their bests, newest first (only one workout's when p_log is
-- given). The first time an exercise is done sets the bar and isn't a record. kind is
-- 'weight' (value in kg, with the reps done at it), 'e1rm' (estimated one-rep max in kg) or
-- 'reps' (most reps in a set without weights); previous is the best before. A weight counts
-- only when it is at least 0.05 kg more (less than any real plate, so rounding between kg and
-- lb never makes a record), and an estimated max when it is at least 0.5 kg more.
create function public.records_for(p_user uuid, p_limit int, p_log uuid)
returns table (
  log_id uuid,
  day date,
  finished_at timestamptz,
  exercise_name text,
  kind text,
  value numeric,
  reps int,
  previous numeric
)
language sql
stable
set search_path = ''
as $$
  with w as (
    select b.*,
           max(b.top_weight_kg) over before_this as prev_weight,
           max(b.top_e1rm_kg) over before_this as prev_e1rm,
           max(b.top_reps) over before_this as prev_reps
      from public.exercise_bests(p_user) b
    window before_this as (partition by b.exercise_key order by b.finished_at, b.log_id
                           rows between unbounded preceding and 1 preceding)
  ),
  r as (
    select w.log_id, w.day, w.finished_at, w.exercise_name, 'weight' as kind, w.top_weight_kg as value,
           w.top_weight_reps as reps, w.prev_weight as previous
      from w where w.top_weight_kg >= w.prev_weight + 0.05
    union all
    select w.log_id, w.day, w.finished_at, w.exercise_name, 'e1rm', w.top_e1rm_kg, null, w.prev_e1rm
      from w where w.top_e1rm_kg >= w.prev_e1rm + 0.5
    union all
    select w.log_id, w.day, w.finished_at, w.exercise_name, 'reps', w.top_reps, null, w.prev_reps
      from w where w.top_reps > w.prev_reps
  )
  select r.log_id, r.day, r.finished_at, r.exercise_name, r.kind, r.value, r.reps, r.previous
    from r
   where p_log is null or r.log_id = p_log
   order by r.finished_at desc, r.exercise_name, r.kind
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

revoke execute on function public.records_for(uuid, int, uuid) from public, anon, authenticated;

-- A person's workouts, newest first, each with its sets in order (at most 100 at a time;
-- p_before pages back). from_my_plan says whether the signed-in trainer set the plan workout.
create function public.workout_logs_for(p_user uuid, p_before timestamptz, p_limit int)
returns table (
  id uuid,
  plan_item_id uuid,
  from_my_plan boolean,
  workout_name text,
  day date,
  started_at timestamptz,
  finished_at timestamptz,
  note text,
  sets jsonb
)
language sql
stable
set search_path = ''
as $$
  select l.id, l.plan_item_id, coalesce(pi.trainer_id = auth.uid(), false),
         l.workout_name, l.day, l.started_at, l.finished_at, l.note,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'position', s.position, 'exercise_name', s.exercise_name, 'set_number', s.set_number,
                    'weight_kg', s.weight_kg, 'reps', s.reps)
                  order by s.position, s.set_number)
             from public.workout_sets s
            where s.log_id = l.id
         ), '[]'::jsonb)
    from public.workout_logs l
    left join public.plan_items pi on pi.id = l.plan_item_id
   where p_user is not null
     and l.user_id = p_user
     and (p_before is null or l.finished_at < p_before)
   order by l.finished_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

revoke execute on function public.workout_logs_for(uuid, timestamptz, int) from public, anon, authenticated;

-- The sets from the last time a person did each of these exercises (by name, any case; at
-- most 50 names), for "Last time" in the workout.
create function public.last_sets_for(p_user uuid, p_exercises text[])
returns table (
  exercise_key text,
  log_id uuid,
  day date,
  set_number int,
  weight_kg numeric,
  reps int
)
language sql
stable
set search_path = ''
as $$
  with wanted as (
    select distinct lower(btrim(e)) as k
      from unnest(p_exercises[1:50]) e
     where e is not null and btrim(e) <> ''
  ),
  latest as (
    select w.k,
           (select s.log_id
              from public.workout_sets s
              join public.workout_logs l on l.id = s.log_id
             where s.user_id = p_user
               and lower(btrim(s.exercise_name)) = w.k
             order by l.finished_at desc
             limit 1) as log_id
      from wanted w
  )
  select la.k, la.log_id, l.day, s.set_number::int, s.weight_kg, s.reps::int
    from latest la
    join public.workout_logs l on l.id = la.log_id
    join public.workout_sets s on s.log_id = la.log_id and lower(btrim(s.exercise_name)) = la.k
   where p_user is not null
   order by la.k, s.position, s.set_number;
$$;

revoke execute on function public.last_sets_for(uuid, text[]) from public, anon, authenticated;

-- ---------- Saving a workout (Voltrix) ----------

-- Saves a finished workout and says what it beat:
--   { "log_id": "...", "ticked": true, "records": [{ "exercise_name", "kind", "value", "reps", "previous" }] }
-- p_log is { "id", "plan_item_id", "workout_name", "day", "started_at", "finished_at", "note",
--            "sets": [{ "position", "exercise_name", "set_number", "weight_kg", "reps" }] }
-- with 1 to 1500 sets (weight_kg and reps may both be null: a set just done). Saving the same
-- id again (a retry) adds nothing and answers the same. The plan workout is ticked off for
-- the day it was done, like the tick on the plan, while it is still in the person's plan and
-- that day is today (a day either side for time zones); the workout is saved either way. At
-- most 20 workouts are saved in any 24 hours.
create function public.finish_workout(p_log jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  saved_id uuid;
  item uuid;
  done_day date;
  started timestamptz;
  finished timestamptz;
  title text;
  set_list jsonb;
  saved_by uuid;
  ticked boolean := false;
  beaten jsonb;
  ahead interval;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  -- One save at a time per person, so two at once can't both slip under the limit or clash on
  -- the id (a double tap, or a retry while the first call is still running).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finish_workout:' || me::text, 0));
  if jsonb_typeof(p_log) is distinct from 'object' then
    raise exception 'Send the workout to save.' using errcode = '22023';
  end if;
  saved_id := (p_log ->> 'id')::uuid;
  if saved_id is null then
    raise exception 'The workout needs an id.' using errcode = '22023';
  end if;

  select l.user_id into saved_by from public.workout_logs l where l.id = saved_id;
  if saved_by is not null and saved_by <> me then
    raise exception 'This workout can''t be saved.' using errcode = '42501';
  end if;

  if saved_by is null then
    title := left(btrim(coalesce(p_log ->> 'workout_name', '')), 120);
    done_day := (p_log ->> 'day')::date;
    started := (p_log ->> 'started_at')::timestamptz;
    finished := coalesce((p_log ->> 'finished_at')::timestamptz, now());
    set_list := p_log -> 'sets';
    if title = '' then
      raise exception 'The workout needs a name.' using errcode = '22023';
    end if;
    -- The phone's clock decides how long it took. A clock that is days fast moved the day on
    -- too, so both are moved back to now, keeping how long it took. (A finish time long ago is
    -- an old workout, or a slow clock: its day is refused below either way.)
    if finished > now() + interval '1 day' then
      ahead := finished - now();
      started := started - ahead;
      finished := now();
      done_day := done_day - floor(extract(epoch from ahead) / 86400)::int;
    elsif finished < now() - interval '9 days' then
      started := started + (now() - finished);
      finished := now();
    end if;
    if done_day is null or done_day not between today - 8 and today + 1 then
      raise exception 'Workouts can be saved up to a week after they were done.' using errcode = '22023';
    end if;
    if started is null or started > finished or finished - started > interval '24 hours' then
      raise exception 'The workout''s start time doesn''t look right.' using errcode = '22023';
    end if;
    if jsonb_typeof(set_list) is distinct from 'array' or jsonb_array_length(set_list) = 0 then
      raise exception 'Tick off at least one set to save the workout.' using errcode = '22023';
    end if;
    -- 50 exercises of 30 sets, the most the sets table takes (and the app allows).
    if jsonb_array_length(set_list) > 1500 then
      raise exception 'That''s more sets than one workout can save.' using errcode = '22023';
    end if;
    if (select count(*) from public.workout_logs l
         where l.user_id = me and l.created_at > now() - interval '24 hours') >= 20 then
      raise exception 'That''s a lot of workouts for one day. Try again tomorrow.' using errcode = '22023';
    end if;
    item := nullif(p_log ->> 'plan_item_id', '')::uuid;
    -- Taken off the plan meanwhile, or not theirs: the workout is saved on its own.
    if item is not null and not public.is_my_plan_item(item) then
      item := null;
    end if;

    insert into public.workout_logs (id, user_id, plan_item_id, workout_name, day, started_at, finished_at, note)
    values (saved_id, me, item, title, done_day, started, finished,
            nullif(left(btrim(coalesce(p_log ->> 'note', '')), 1000), ''));

    insert into public.workout_sets (log_id, user_id, position, exercise_name, set_number, weight_kg, reps)
    select saved_id, me, (s ->> 'position')::smallint, left(btrim(s ->> 'exercise_name'), 120),
           (s ->> 'set_number')::smallint, round((s ->> 'weight_kg')::numeric, 3), (s ->> 'reps')::smallint
      from jsonb_array_elements(set_list) s;
  end if;

  -- Tick the plan workout off (again, for a retry: a tick already there stays).
  select l.plan_item_id, l.day into item, done_day from public.workout_logs l where l.id = saved_id;
  if item is not null and done_day between today - 1 and today + 1 and public.is_my_plan_item(item) then
    insert into public.plan_completions (plan_item_id, done_on, user_id)
    values (item, done_day, me)
    on conflict (plan_item_id, done_on) do nothing;
    ticked := exists (
      select 1 from public.plan_completions pc
       where pc.plan_item_id = item and pc.done_on = done_day and pc.user_id = me
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'exercise_name', r.exercise_name, 'kind', r.kind, 'value', r.value, 'reps', r.reps, 'previous', r.previous)
         order by r.exercise_name, r.kind), '[]'::jsonb)
    into beaten
    from public.records_for(me, 200, saved_id) r;

  return jsonb_build_object('log_id', saved_id, 'ticked', ticked, 'records', beaten);
end;
$$;

revoke execute on function public.finish_workout(jsonb) from public, anon;
grant execute on function public.finish_workout(jsonb) to authenticated;

-- ---------- The client's own reads (Voltrix) ----------

create function public.my_workout_logs(p_before timestamptz default null, p_limit int default 20)
returns table (
  id uuid,
  plan_item_id uuid,
  from_my_plan boolean,
  workout_name text,
  day date,
  started_at timestamptz,
  finished_at timestamptz,
  note text,
  sets jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.workout_logs_for(auth.uid(), p_before, p_limit);
$$;

revoke execute on function public.my_workout_logs(timestamptz, int) from public, anon;
grant execute on function public.my_workout_logs(timestamptz, int) to authenticated;

create function public.my_personal_bests()
returns table (
  exercise_name text,
  best_weight_kg numeric,
  best_weight_reps int,
  best_weight_on date,
  best_e1rm_kg numeric,
  best_e1rm_on date,
  most_reps int,
  most_reps_on date,
  last_done_on date,
  times_done int
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.personal_bests_for(auth.uid());
$$;

revoke execute on function public.my_personal_bests() from public, anon;
grant execute on function public.my_personal_bests() to authenticated;

create function public.my_records(p_limit int default 50)
returns table (
  log_id uuid,
  day date,
  finished_at timestamptz,
  exercise_name text,
  kind text,
  value numeric,
  reps int,
  previous numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.records_for(auth.uid(), p_limit, null);
$$;

revoke execute on function public.my_records(int) from public, anon;
grant execute on function public.my_records(int) to authenticated;

create function public.my_last_sets(p_exercises text[])
returns table (
  exercise_key text,
  log_id uuid,
  day date,
  set_number int,
  weight_kg numeric,
  reps int
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.last_sets_for(auth.uid(), p_exercises);
$$;

revoke execute on function public.my_last_sets(text[]) from public, anon;
grant execute on function public.my_last_sets(text[]) to authenticated;

-- The signed-in person's check-ins, newest first, with every reply from their trainers.
create function public.my_check_ins(p_limit int default 12)
returns table (
  id uuid,
  week_start date,
  rating smallint,
  energy smallint,
  sleep smallint,
  stress smallint,
  wins text,
  struggles text,
  weight_kg numeric,
  created_at timestamptz,
  updated_at timestamptz,
  replies jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select ci.id, ci.week_start, ci.rating, ci.energy, ci.sleep, ci.stress, ci.wins, ci.struggles, ci.weight_kg,
         ci.created_at, ci.updated_at,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'trainer_id', r.trainer_id,
                    'trainer_name', coalesce(nullif(btrim(p.full_name), ''), p.business_name, 'Your trainer'),
                    'trainer_avatar', p.avatar_url,
                    'body', r.body,
                    'updated_at', r.updated_at)
                  order by r.created_at)
             from public.check_in_replies r
             join public.profiles p on p.id = r.trainer_id
            where r.check_in_id = ci.id
         ), '[]'::jsonb)
    from public.check_ins ci
   where auth.uid() is not null
     and ci.user_id = auth.uid()
   order by ci.week_start desc
   limit least(greatest(coalesce(p_limit, 12), 1), 100);
$$;

revoke execute on function public.my_check_ins(int) from public, anon;
grant execute on function public.my_check_ins(int) to authenticated;

-- Adds to (p_add) or sets one habit for a day and returns the day. Adding happens here, so
-- two quick taps both count. Amounts are kept within each habit's limits, and adding a
-- negative amount takes some off (never below 0). Days from a month ago to tomorrow, as the
-- row rules allow, with a plain message for a phone whose date is far out.
create function public.log_habit(p_day date, p_habit text, p_amount int, p_add boolean default true)
returns public.habit_days
language plpgsql
set search_path = ''
as $$
declare
  saved public.habit_days;
  amount int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_day is null or p_habit is null or p_habit not in ('water', 'steps', 'sleep') or p_amount is null then
    raise exception 'That habit can''t be saved.' using errcode = '22023';
  end if;
  if p_day not between (now() at time zone 'utc')::date - 31 and (now() at time zone 'utc')::date + 1 then
    raise exception 'Habits can be logged for the last month only.' using errcode = '22023';
  end if;
  -- Kept within the habit's range first, so adding can't overflow.
  amount := least(greatest(p_amount, -200000), 200000);
  insert into public.habit_days as h (day, water_ml, steps, sleep_minutes)
  values (
    p_day,
    case when p_habit = 'water' then least(greatest(amount, 0), 20000) else 0 end,
    case when p_habit = 'steps' then least(greatest(amount, 0), 200000) else 0 end,
    case when p_habit = 'sleep' then least(greatest(amount, 0), 1440) end
  )
  on conflict (user_id, day) do update set
    water_ml = case
      when p_habit <> 'water' then h.water_ml
      when p_add then least(greatest(h.water_ml + amount, 0), 20000)
      else least(greatest(amount, 0), 20000)
    end,
    steps = case
      when p_habit <> 'steps' then h.steps
      when p_add then least(greatest(h.steps + amount, 0), 200000)
      else least(greatest(amount, 0), 200000)
    end,
    sleep_minutes = case
      when p_habit <> 'sleep' then h.sleep_minutes
      when p_add then least(greatest(coalesce(h.sleep_minutes, 0) + amount, 0), 1440)
      else least(greatest(amount, 0), 1440)
    end
  returning h.* into saved;
  return saved;
end;
$$;

revoke execute on function public.log_habit(date, text, int, boolean) from public, anon;
grant execute on function public.log_habit(date, text, int, boolean) to authenticated;

-- ---------- The trainer's reads (Voltrix Coach) ----------
-- Each takes the trainer's client row and is empty unless coached_user() allows it.

create function public.client_workout_logs(p_client uuid, p_before timestamptz default null, p_limit int default 20)
returns table (
  id uuid,
  plan_item_id uuid,
  from_my_plan boolean,
  workout_name text,
  day date,
  started_at timestamptz,
  finished_at timestamptz,
  note text,
  sets jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.workout_logs_for(public.coached_user(p_client), p_before, p_limit);
$$;

revoke execute on function public.client_workout_logs(uuid, timestamptz, int) from public, anon;
grant execute on function public.client_workout_logs(uuid, timestamptz, int) to authenticated;

create function public.client_personal_bests(p_client uuid)
returns table (
  exercise_name text,
  best_weight_kg numeric,
  best_weight_reps int,
  best_weight_on date,
  best_e1rm_kg numeric,
  best_e1rm_on date,
  most_reps int,
  most_reps_on date,
  last_done_on date,
  times_done int
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.personal_bests_for(public.coached_user(p_client));
$$;

revoke execute on function public.client_personal_bests(uuid) from public, anon;
grant execute on function public.client_personal_bests(uuid) to authenticated;

create function public.client_records(p_client uuid, p_limit int default 50)
returns table (
  log_id uuid,
  day date,
  finished_at timestamptz,
  exercise_name text,
  kind text,
  value numeric,
  reps int,
  previous numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.records_for(public.coached_user(p_client), p_limit, null);
$$;

revoke execute on function public.client_records(uuid, int) from public, anon;
grant execute on function public.client_records(uuid, int) to authenticated;

-- Body weights between two days (at most about 13 months at a time), oldest first.
create function public.client_body_weights(p_client uuid, p_from date, p_to date)
returns table (
  day date,
  weight_kg numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select w.day, w.weight_kg
    from public.body_weights w
   where w.user_id = (select public.coached_user(p_client))
     and p_to >= p_from
     and p_to - p_from <= 400
     and w.day between p_from and p_to
   order by w.day;
$$;

revoke execute on function public.client_body_weights(uuid, date, date) from public, anon;
grant execute on function public.client_body_weights(uuid, date, date) to authenticated;

-- Body measurements between two days (at most about 13 months at a time), oldest first.
create function public.client_measurements(p_client uuid, p_from date, p_to date)
returns table (
  day date,
  waist_cm numeric,
  hips_cm numeric,
  chest_cm numeric,
  arm_cm numeric,
  thigh_cm numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.day, m.waist_cm, m.hips_cm, m.chest_cm, m.arm_cm, m.thigh_cm
    from public.body_measurements m
   where m.user_id = (select public.coached_user(p_client))
     and p_to >= p_from
     and p_to - p_from <= 400
     and m.day between p_from and p_to
   order by m.day;
$$;

revoke execute on function public.client_measurements(uuid, date, date) from public, anon;
grant execute on function public.client_measurements(uuid, date, date) to authenticated;

-- The newest progress photos (at most 90). The app then asks storage for short-lived links,
-- which the storage rules below allow while the trainer may read them.
create function public.client_progress_photos(p_client uuid, p_limit int default 30)
returns table (
  id uuid,
  day date,
  pose text,
  path text,
  width int,
  height int
)
language sql
stable
security definer
set search_path = ''
as $$
  select ph.id, ph.day, ph.pose, ph.path, ph.width, ph.height
    from public.progress_photos ph
   where ph.user_id = (select public.coached_user(p_client))
   order by ph.day desc, array_position(array['front', 'side', 'back'], ph.pose)
   limit least(greatest(coalesce(p_limit, 30), 1), 90);
$$;

revoke execute on function public.client_progress_photos(uuid, int) from public, anon;
grant execute on function public.client_progress_photos(uuid, int) to authenticated;

-- The client's check-ins, newest first, with the signed-in trainer's own reply. Other
-- trainers' replies stay between them and the client.
create function public.client_check_ins(p_client uuid, p_limit int default 12)
returns table (
  id uuid,
  week_start date,
  rating smallint,
  energy smallint,
  sleep smallint,
  stress smallint,
  wins text,
  struggles text,
  weight_kg numeric,
  created_at timestamptz,
  updated_at timestamptz,
  my_reply text,
  my_reply_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ci.id, ci.week_start, ci.rating, ci.energy, ci.sleep, ci.stress, ci.wins, ci.struggles, ci.weight_kg,
         ci.created_at, ci.updated_at, r.body, r.updated_at
    from public.check_ins ci
    left join public.check_in_replies r on r.check_in_id = ci.id and r.trainer_id = auth.uid()
   where ci.user_id = (select public.coached_user(p_client))
   order by ci.week_start desc
   limit least(greatest(coalesce(p_limit, 12), 1), 52);
$$;

revoke execute on function public.client_check_ins(uuid, int) from public, anon;
grant execute on function public.client_check_ins(uuid, int) to authenticated;

-- Writes (or changes) the signed-in trainer's reply to a check-in of a person they coach,
-- and tells the person ('progress' on their inbox channel).
create function public.reply_to_check_in(p_check_in uuid, p_body text)
returns public.check_in_replies
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  person uuid;
  reply_text text := btrim(coalesce(p_body, ''));
  saved public.check_in_replies;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select ci.user_id into person from public.check_ins ci where ci.id = p_check_in;
  if person is null or not public.coaches_user(person) then
    raise exception 'This check-in is no longer available.' using errcode = '42501';
  end if;
  if char_length(reply_text) not between 1 and 2000 then
    raise exception 'Write a reply of up to 2000 characters.' using errcode = '22023';
  end if;
  insert into public.check_in_replies as r (check_in_id, trainer_id, body)
  values (p_check_in, me, reply_text)
  on conflict (check_in_id, trainer_id) do update set body = excluded.body
  returning r.* into saved;
  perform public.send_to_inbox(person, 'progress', jsonb_build_object('kind', 'reply', 'check_in_id', p_check_in));
  return saved;
end;
$$;

revoke execute on function public.reply_to_check_in(uuid, text) from public, anon;
grant execute on function public.reply_to_check_in(uuid, text) to authenticated;

-- Water, steps and sleep between two days (at most about three months at a time), oldest first.
create function public.client_habits(p_client uuid, p_from date, p_to date)
returns table (
  day date,
  water_ml int,
  steps int,
  sleep_minutes int
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.day, h.water_ml, h.steps, h.sleep_minutes
    from public.habit_days h
   where h.user_id = (select public.coached_user(p_client))
     and p_to >= p_from
     and p_to - p_from <= 92
     and h.day between p_from and p_to
   order by h.day;
$$;

revoke execute on function public.client_habits(uuid, date, date) from public, anon;
grant execute on function public.client_habits(uuid, date, date) to authenticated;

-- The client's habit targets (the defaults when they never set any). No row unless the
-- trainer may read their habits.
create function public.client_habit_targets(p_client uuid)
returns table (
  water_ml int,
  steps int,
  sleep_minutes int
)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(t.water_ml, 2500), coalesce(t.steps, 8000), coalesce(t.sleep_minutes, 480)
    from (select public.coached_user(p_client) as person) x
    left join public.habit_targets t on t.user_id = x.person
   where x.person is not null;
$$;

revoke execute on function public.client_habit_targets(uuid) from public, anon;
grant execute on function public.client_habit_targets(uuid) to authenticated;

-- ---------- Photo files ----------

-- Private, up to 3 MB a photo (the app always sends a JPEG of 1080 px or less, about 300 KB).
-- JPEG, PNG and WebP. A bucket of this name made by hand before is made private too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- How many files the signed-in person has in their progress photo folder (unused ones too).
create function public.my_progress_photo_file_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from storage.objects o
   where auth.uid() is not null
     and o.bucket_id = 'progress-photos'
     and o.name like auth.uid()::text || '/%';
$$;

revoke execute on function public.my_progress_photo_file_count() from public, anon;
grant execute on function public.my_progress_photo_file_count() to authenticated;

-- Can the signed-in trainer see this progress photo file? Only a file saved as one of the
-- person's progress photos, while the trainer may read their logs.
create function public.can_view_progress_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.progress_photos ph
     where ph.path = p_name
       and public.coaches_user(ph.user_id)
  );
$$;

revoke execute on function public.can_view_progress_photo(text) from public, anon;
grant execute on function public.can_view_progress_photo(text) to authenticated;

-- People add and remove photos in their own folder only. They see their own, and their
-- trainers get short-lived links to the ones saved as progress photos. A file goes straight
-- in the person's folder (no folders inside it), named like the app names it, and at most
-- 1000 of them.
create policy progress_photo_files_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpg|jpeg|png|webp)$'
    and (select public.my_progress_photo_file_count()) < 1000
  );

create policy progress_photo_files_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy progress_photo_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_view_progress_photo(name))
  );
