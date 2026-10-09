-- Nutrition in both apps (Ryan, 2026-10-08: "on the apps there must be a nutrition place
-- and you must be able to scan a bar code somthing and it tells you how many couliries on
-- both apps and they must be able to set the personal trainer like a clients nutrition
-- plan ... under that user name or client").
--
-- Everyone keeps their own food diary in Voltrix: what they ate on each day, by meal.
-- Food facts come from Open Food Facts in the app; a food it doesn't know can be saved
-- as the person's own food (by barcode, so the next scan finds it). A trainer sets one
-- nutrition plan per client in Voltrix Coach, and can read the food diary of a client
-- who has joined the app. Clients read their plans and trainers read diaries only
-- through the functions at the end, which check who is asking.

-- ---------- Food diary ----------

create table public.food_diary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The day on the person's phone when they ate it (their own date, not UTC).
  day date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snacks')),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  brand text check (brand is null or char_length(brand) <= 200),
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  amount numeric(8, 2) not null check (amount > 0 and amount <= 100000),
  unit text not null check (unit in ('g', 'ml', 'serving')),
  -- What the amount eaten adds up to.
  kcal numeric(7, 1) not null check (kcal between 0 and 50000),
  protein numeric(6, 1) check (protein is null or protein between 0 and 5000),
  carbs numeric(6, 1) check (carbs is null or carbs between 0 and 5000),
  fat numeric(6, 1) check (fat is null or fat between 0 and 5000),
  created_at timestamptz not null default now()
);

create index food_diary_user_day_idx on public.food_diary (user_id, day);
-- "Recent foods" lists the newest entries first.
create index food_diary_user_recent_idx on public.food_diary (user_id, created_at desc);

-- ---------- The person's own foods ----------

create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  barcode text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  brand text check (brand is null or char_length(brand) <= 200),
  -- The numbers below are for 100 g (100 ml for drinks) or for one serving.
  per text not null default '100g' check (per in ('100g', 'serving')),
  kcal numeric(7, 1) not null check (kcal between 0 and 50000),
  protein numeric(6, 1) check (protein is null or protein between 0 and 5000),
  carbs numeric(6, 1) check (carbs is null or carbs between 0 and 5000),
  fat numeric(6, 1) check (fat is null or fat between 0 and 5000),
  -- Grams (ml for drinks) in one serving, when the person knows it.
  serving_size numeric(7, 1) check (serving_size is null or (serving_size > 0 and serving_size <= 10000)),
  liquid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One food per barcode for each person. Foods without a barcode don't clash.
  unique (user_id, barcode)
);

create trigger custom_foods_set_updated_at before update on public.custom_foods
  for each row execute function public.set_updated_at();

-- ---------- Nutrition plans ----------

-- A plan's meals: [{ "name": "Breakfast", "food": "3 eggs and 2 slices of toast" }, ...]
create function public.valid_plan_meals(p_meals jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_meals) is distinct from 'array' then false
    when jsonb_array_length(p_meals) > 12 then false
    else not exists (
      select 1
        from jsonb_array_elements(p_meals) m
       where case
         when jsonb_typeof(m) <> 'object' then true
         else coalesce(jsonb_typeof(m -> 'name'), '') <> 'string'
           or char_length(btrim(m ->> 'name')) not between 1 and 100
           or coalesce(jsonb_typeof(m -> 'food'), 'string') <> 'string'
           or char_length(coalesce(m ->> 'food', '')) > 1000
           or exists (select 1 from jsonb_object_keys(m) k where k not in ('name', 'food'))
       end
    )
  end;
$$;

revoke execute on function public.valid_plan_meals(jsonb) from public, anon;
grant execute on function public.valid_plan_meals(jsonb) to authenticated;

create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- One plan per client of a trainer.
  client_id uuid not null unique references public.clients (id) on delete cascade,
  kcal int check (kcal is null or kcal between 500 and 10000),
  protein_g int check (protein_g is null or protein_g between 0 and 1000),
  carbs_g int check (carbs_g is null or carbs_g between 0 and 2000),
  fat_g int check (fat_g is null or fat_g between 0 and 1000),
  meals jsonb not null default '[]'::jsonb check (public.valid_plan_meals(meals)),
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index nutrition_plans_trainer_idx on public.nutrition_plans (trainer_id);

create trigger nutrition_plans_set_updated_at before update on public.nutrition_plans
  for each row execute function public.set_updated_at();

-- ---------- Row level security ----------

alter table public.food_diary enable row level security;
alter table public.custom_foods enable row level security;
alter table public.nutrition_plans enable row level security;

revoke all on public.food_diary, public.custom_foods, public.nutrition_plans from anon, authenticated;

grant select, delete on public.food_diary to authenticated;
grant insert (day, meal, name, brand, barcode, amount, unit, kcal, protein, carbs, fat) on public.food_diary to authenticated;
grant update (meal, amount, kcal, protein, carbs, fat) on public.food_diary to authenticated;

grant select, delete on public.custom_foods to authenticated;
grant insert (barcode, name, brand, per, kcal, protein, carbs, fat, serving_size, liquid) on public.custom_foods to authenticated;
grant update (name, brand, per, kcal, protein, carbs, fat, serving_size, liquid) on public.custom_foods to authenticated;

grant select, delete on public.nutrition_plans to authenticated;
grant insert (client_id, kcal, protein_g, carbs_g, fat_g, meals, notes) on public.nutrition_plans to authenticated;
grant update (kcal, protein_g, carbs_g, fat_g, meals, notes) on public.nutrition_plans to authenticated;

-- Each person only ever touches their own diary and foods.
create policy food_diary_select_own on public.food_diary
  for select to authenticated using (user_id = (select auth.uid()));
create policy food_diary_insert_own on public.food_diary
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy food_diary_update_own on public.food_diary
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy food_diary_delete_own on public.food_diary
  for delete to authenticated using (user_id = (select auth.uid()));

create policy custom_foods_select_own on public.custom_foods
  for select to authenticated using (user_id = (select auth.uid()));
create policy custom_foods_insert_own on public.custom_foods
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy custom_foods_update_own on public.custom_foods
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy custom_foods_delete_own on public.custom_foods
  for delete to authenticated using (user_id = (select auth.uid()));

-- Trainers manage plans for their own clients only. Clients read theirs through
-- my_nutrition_plans(), which leaves out the trainer's other clients.
create policy nutrition_plans_select_own on public.nutrition_plans
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy nutrition_plans_insert_own on public.nutrition_plans
  for insert to authenticated
  with check (trainer_id = (select auth.uid()) and (select public.is_trainer()) and (select public.owns_client(client_id)));
create policy nutrition_plans_update_own on public.nutrition_plans
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()) and (select public.owns_client(client_id)));
create policy nutrition_plans_delete_own on public.nutrition_plans
  for delete to authenticated using (trainer_id = (select auth.uid()));

-- ---------- Reading across people ----------

-- The signed-in client's nutrition plans from all their trainers, newest first.
-- Plans from archived links and from trainers either side has blocked stay hidden.
create function public.my_nutrition_plans()
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
     and public.can_see_author(c.trainer_id)
   order by n.updated_at desc;
$$;

revoke execute on function public.my_nutrition_plans() from public, anon;
grant execute on function public.my_nutrition_plans() to authenticated;

-- What one of the signed-in trainer's clients logged in their food diary between two
-- days (at most about three months at a time). Empty unless the client has joined the
-- app, the link isn't archived and neither of them has blocked the other.
create function public.client_food_diary(p_client uuid, p_from date, p_to date)
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
     and public.can_see_author(c.user_id)
     and p_to >= p_from
     and p_to - p_from <= 92
     and f.day between p_from and p_to
   order by f.day, f.created_at;
$$;

revoke execute on function public.client_food_diary(uuid, date, date) from public, anon;
grant execute on function public.client_food_diary(uuid, date, date) to authenticated;
