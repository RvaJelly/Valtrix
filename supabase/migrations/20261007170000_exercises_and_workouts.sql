-- Valtrix: exercise library and workout builder.

-- Exercises. trainer_id null = the built-in Valtrix library everyone can see;
-- otherwise a trainer's own custom exercise.
create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  muscle_group text not null check (muscle_group in ('chest', 'back', 'shoulders', 'arms', 'legs', 'glutes', 'core', 'full_body', 'cardio')),
  equipment text not null default 'none' check (equipment in ('none', 'barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'band', 'other')),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  created_at timestamptz not null default now()
);

create index exercises_trainer_id_idx on public.exercises (trainer_id);
create unique index exercises_library_name_key on public.exercises (lower(name)) where trainer_id is null;

-- Workout templates a trainer builds and later assigns to clients.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_trainer_id_idx on public.workouts (trainer_id);

create trigger workouts_set_updated_at before update on public.workouts
  for each row execute function public.set_updated_at();

-- The exercises in a workout, in order. reps and weight are free text so a
-- trainer can write "8-12", "AMRAP", "60 s" or "RPE 8".
create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position int not null check (position >= 0),
  sets int not null default 3 check (sets between 1 and 20),
  reps text not null default '10' check (char_length(reps) between 1 and 30),
  weight text check (weight is null or char_length(weight) <= 30),
  rest_seconds int check (rest_seconds is null or rest_seconds between 0 and 900),
  notes text check (notes is null or char_length(notes) <= 500)
);

create index workout_exercises_workout_id_idx on public.workout_exercises (workout_id, position);
create index workout_exercises_exercise_id_idx on public.workout_exercises (exercise_id);

-- Row level security.
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;

revoke all on public.exercises, public.workouts, public.workout_exercises from anon, authenticated;
grant select, delete on public.exercises to authenticated;
grant insert (name, muscle_group, equipment, instructions) on public.exercises to authenticated;
grant update (name, muscle_group, equipment, instructions) on public.exercises to authenticated;
grant select, delete on public.workouts to authenticated;
grant insert (name, notes) on public.workouts to authenticated;
grant update (name, notes) on public.workouts to authenticated;
grant select, insert, update, delete on public.workout_exercises to authenticated;

create policy exercises_select on public.exercises
  for select to authenticated using (trainer_id is null or trainer_id = (select auth.uid()));
create policy exercises_insert_own on public.exercises
  for insert to authenticated with check (trainer_id = (select auth.uid()) and (select public.is_trainer()));
create policy exercises_update_own on public.exercises
  for update to authenticated using (trainer_id = (select auth.uid())) with check (trainer_id = (select auth.uid()));
create policy exercises_delete_own on public.exercises
  for delete to authenticated using (trainer_id = (select auth.uid()));

create policy workouts_select_own on public.workouts
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy workouts_insert_own on public.workouts
  for insert to authenticated with check (trainer_id = (select auth.uid()) and (select public.is_trainer()));
create policy workouts_update_own on public.workouts
  for update to authenticated using (trainer_id = (select auth.uid())) with check (trainer_id = (select auth.uid()));
create policy workouts_delete_own on public.workouts
  for delete to authenticated using (trainer_id = (select auth.uid()));

-- A workout's rows belong to whoever owns the workout. The exercise must be
-- one the trainer can see (library or their own).
create function public.owns_workout(p_workout_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.workouts where id = p_workout_id and trainer_id = auth.uid());
$$;

create function public.can_use_exercise(p_exercise_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.exercises where id = p_exercise_id and (trainer_id is null or trainer_id = auth.uid()));
$$;

revoke execute on function public.owns_workout(uuid), public.can_use_exercise(uuid) from public, anon;
grant execute on function public.owns_workout(uuid), public.can_use_exercise(uuid) to authenticated;

create policy workout_exercises_select_own on public.workout_exercises
  for select to authenticated using ((select public.owns_workout(workout_id)));
create policy workout_exercises_insert_own on public.workout_exercises
  for insert to authenticated with check ((select public.owns_workout(workout_id)) and (select public.can_use_exercise(exercise_id)));
create policy workout_exercises_update_own on public.workout_exercises
  for update to authenticated
  using ((select public.owns_workout(workout_id)))
  with check ((select public.owns_workout(workout_id)) and (select public.can_use_exercise(exercise_id)));
create policy workout_exercises_delete_own on public.workout_exercises
  for delete to authenticated using ((select public.owns_workout(workout_id)));

-- Built-in exercise library.
insert into public.exercises (trainer_id, name, muscle_group, equipment) values
  (null, 'Barbell Bench Press', 'chest', 'barbell'),
  (null, 'Incline Dumbbell Press', 'chest', 'dumbbell'),
  (null, 'Dumbbell Fly', 'chest', 'dumbbell'),
  (null, 'Push-Up', 'chest', 'none'),
  (null, 'Cable Crossover', 'chest', 'cable'),
  (null, 'Chest Press Machine', 'chest', 'machine'),
  (null, 'Pull-Up', 'back', 'none'),
  (null, 'Lat Pulldown', 'back', 'cable'),
  (null, 'Barbell Row', 'back', 'barbell'),
  (null, 'One-Arm Dumbbell Row', 'back', 'dumbbell'),
  (null, 'Seated Cable Row', 'back', 'cable'),
  (null, 'Deadlift', 'back', 'barbell'),
  (null, 'Overhead Press', 'shoulders', 'barbell'),
  (null, 'Seated Dumbbell Shoulder Press', 'shoulders', 'dumbbell'),
  (null, 'Lateral Raise', 'shoulders', 'dumbbell'),
  (null, 'Face Pull', 'shoulders', 'cable'),
  (null, 'Rear Delt Fly', 'shoulders', 'dumbbell'),
  (null, 'Barbell Curl', 'arms', 'barbell'),
  (null, 'Dumbbell Hammer Curl', 'arms', 'dumbbell'),
  (null, 'Tricep Pushdown', 'arms', 'cable'),
  (null, 'Overhead Tricep Extension', 'arms', 'dumbbell'),
  (null, 'Bench Dip', 'arms', 'none'),
  (null, 'Back Squat', 'legs', 'barbell'),
  (null, 'Front Squat', 'legs', 'barbell'),
  (null, 'Goblet Squat', 'legs', 'dumbbell'),
  (null, 'Leg Press', 'legs', 'machine'),
  (null, 'Walking Lunge', 'legs', 'dumbbell'),
  (null, 'Bulgarian Split Squat', 'legs', 'dumbbell'),
  (null, 'Leg Extension', 'legs', 'machine'),
  (null, 'Lying Leg Curl', 'legs', 'machine'),
  (null, 'Standing Calf Raise', 'legs', 'machine'),
  (null, 'Romanian Deadlift', 'glutes', 'barbell'),
  (null, 'Hip Thrust', 'glutes', 'barbell'),
  (null, 'Glute Bridge', 'glutes', 'none'),
  (null, 'Cable Kickback', 'glutes', 'cable'),
  (null, 'Plank', 'core', 'none'),
  (null, 'Side Plank', 'core', 'none'),
  (null, 'Hanging Leg Raise', 'core', 'none'),
  (null, 'Cable Crunch', 'core', 'cable'),
  (null, 'Russian Twist', 'core', 'none'),
  (null, 'Dead Bug', 'core', 'none'),
  (null, 'Kettlebell Swing', 'full_body', 'kettlebell'),
  (null, 'Burpee', 'full_body', 'none'),
  (null, 'Thruster', 'full_body', 'barbell'),
  (null, 'Farmer''s Carry', 'full_body', 'dumbbell'),
  (null, 'Treadmill Run', 'cardio', 'machine'),
  (null, 'Rowing Machine', 'cardio', 'machine'),
  (null, 'Stationary Bike', 'cardio', 'machine'),
  (null, 'Jump Rope', 'cardio', 'other'),
  (null, 'Mountain Climber', 'cardio', 'none');
