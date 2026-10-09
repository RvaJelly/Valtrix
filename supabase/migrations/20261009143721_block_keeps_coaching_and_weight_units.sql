-- Fixes from testing (2026-10-09).
--
-- 1. Blocking someone from a story, reel or comment only hides social posts, as the
--    block dialog says. It no longer also hides a client's nutrition plan from them or
--    their food diary from their trainer, while the workout plan, chat, calls and
--    sessions kept working. The coaching link (the clients row) decides access to the
--    plan and the diary, like it does for my_plan() and my_chats(). A trainer ends the
--    link by archiving the client.
--
-- 2. Each workout weight keeps the unit it was written in (kg or lb). Before, weights
--    were plain numbers read in the trainer's current unit, so switching Settings >
--    Weight units changed every weight clients had already been given (40 kg became
--    40 lb).

-- ---------- 1. Blocks don't hide coaching ----------

-- Same as before, without the block check.
create or replace function public.my_nutrition_plans()
returns table (
  id uuid,
  trainer_id uuid,
  trainer_name text,
  kcal int,
  protein_g int,
  carbs_g int,
  fat_g int,
  meals jsonb,
  notes text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, c.trainer_id,
         coalesce(nullif(btrim(p.full_name), ''), p.business_name, 'Your trainer'),
         n.kcal, n.protein_g, n.carbs_g, n.fat_g, n.meals, n.notes, n.updated_at
    from public.nutrition_plans n
    join public.clients c on c.id = n.client_id
    join public.profiles p on p.id = c.trainer_id
   where auth.uid() is not null
     and c.user_id = auth.uid()
     and c.status <> 'archived'
   order by n.updated_at desc;
$$;

revoke execute on function public.my_nutrition_plans() from public, anon;
grant execute on function public.my_nutrition_plans() to authenticated;

-- Same as before, without the block check.
create or replace function public.client_food_diary(p_client uuid, p_from date, p_to date)
returns table (
  id uuid,
  day date,
  meal text,
  name text,
  brand text,
  amount numeric,
  unit text,
  kcal numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.day, f.meal, f.name, f.brand, f.amount, f.unit, f.kcal, f.protein, f.carbs, f.fat, f.created_at
    from public.clients c
    join public.food_diary f on f.user_id = c.user_id
   where auth.uid() is not null
     and c.id = p_client
     and c.trainer_id = auth.uid()
     and c.status <> 'archived'
     and p_to >= p_from
     and p_to - p_from <= 92
     and f.day between p_from and p_to
   order by f.day, f.created_at;
$$;

revoke execute on function public.client_food_diary(uuid, date, date) from public, anon;
grant execute on function public.client_food_diary(uuid, date, date) to authenticated;

-- ---------- 2. Weight units ----------

-- Null for weights from app versions that don't send it; those read in the trainer's
-- current unit, as before. workout_exercises already allows every column to trainers.
alter table public.workout_exercises
  add column if not exists weight_unit text
    constraint workout_exercises_weight_unit_check check (weight_unit is null or weight_unit in ('kg', 'lb'));

-- The weights already given were written in the trainer's unit as it is now.
update public.workout_exercises we
   set weight_unit = case when p.preferences ->> 'units' = 'lb' then 'lb' else 'kg' end
  from public.workouts w
  join public.profiles p on p.id = w.trainer_id
 where w.id = we.workout_id
   and we.weight is not null
   and we.weight_unit is null;

-- Like my_plan_workout(), plus the unit of each weight. my_plan_workout() stays for app
-- versions already on phones.
create function public.my_plan_workout_v2(p_item uuid)
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
  weight_unit text,
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
         we.sets, we.reps, we.weight,
         coalesce(we.weight_unit, case when p.preferences ->> 'units' = 'lb' then 'lb' else 'kg' end),
         we.rest_seconds, we.notes,
         coalesce(we.video_path, case when e.trainer_id = pi.trainer_id then e.video_path end)
    from public.plan_items pi
    join public.workouts w on w.id = pi.workout_id and w.trainer_id = pi.trainer_id
    join public.workout_exercises we on we.workout_id = w.id
    join public.exercises e on e.id = we.exercise_id
    join public.profiles p on p.id = pi.trainer_id
   where auth.uid() is not null
     and pi.id = p_item
     and public.is_my_plan_item(p_item)
   order by we.position;
$$;

revoke execute on function public.my_plan_workout_v2(uuid) from public, anon;
grant execute on function public.my_plan_workout_v2(uuid) to authenticated;
