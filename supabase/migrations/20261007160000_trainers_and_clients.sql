-- Valtrix: trainer profiles and their client list.

-- One profile per signed-up user, created by a trigger on auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'trainer' check (role in ('trainer', 'client')),
  full_name text check (full_name is null or char_length(full_name) <= 200),
  business_name text check (business_name is null or char_length(btrim(business_name)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user. role is set at sign-up and cannot be changed by the user.';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 200),
  last_name text check (last_name is null or char_length(last_name) <= 200),
  email text check (email is null or (char_length(email) <= 320 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  phone text check (phone is null or char_length(phone) <= 30),
  goal text check (goal is null or char_length(goal) <= 500),
  notes text check (notes is null or char_length(notes) <= 10000),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  -- Set once the client signs up in the Valtrix client app and links to this trainer.
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_trainer_id_idx on public.clients (trainer_id);
create index clients_user_id_idx on public.clients (user_id);

-- Keep updated_at current.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger clients_set_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

-- Create the profile when someone signs up. Only 'client' is accepted from
-- sign-up metadata; anything else becomes a trainer.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    case when new.raw_user_meta_data ->> 'role' = 'client' then 'client' else 'trainer' end
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row level security.
alter table public.profiles enable row level security;
alter table public.clients enable row level security;

revoke all on public.profiles, public.clients from anon;
revoke all on public.profiles, public.clients from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, business_name) on public.profiles to authenticated;
-- user_id (the link to a client account) is left out on purpose: a reviewed
-- function will set it later, never the trainer directly.
grant select, delete on public.clients to authenticated;
grant insert (first_name, last_name, email, phone, goal, notes, status) on public.clients to authenticated;
grant update (first_name, last_name, email, phone, goal, notes, status) on public.clients to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Only trainers manage clients, and only their own.
create function public.is_trainer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'trainer');
$$;

revoke execute on function public.is_trainer() from public, anon;
grant execute on function public.is_trainer() to authenticated;

create policy clients_select_own on public.clients
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy clients_insert_own on public.clients
  for insert to authenticated with check (trainer_id = (select auth.uid()) and (select public.is_trainer()));
create policy clients_update_own on public.clients
  for update to authenticated using (trainer_id = (select auth.uid())) with check (trainer_id = (select auth.uid()));
create policy clients_delete_own on public.clients
  for delete to authenticated using (trainer_id = (select auth.uid()));
