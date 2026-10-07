-- Valtrix: training sessions on the trainer's calendar.
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  trainer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Null for a block of time that isn't with a client (a class, admin, a break).
  client_id uuid references public.clients (id) on delete set null,
  title text check (title is null or char_length(btrim(title)) between 1 and 120),
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 600),
  location text check (location is null or char_length(location) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (client_id is not null or title is not null)
);

create index sessions_trainer_starts_idx on public.sessions (trainer_id, starts_at);
create index sessions_client_id_idx on public.sessions (client_id);

create trigger sessions_set_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();

-- A trainer can only book their own clients.
create function public.owns_client(p_client_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_client_id is null or exists (select 1 from public.clients where id = p_client_id and trainer_id = auth.uid());
$$;

revoke execute on function public.owns_client(uuid) from public, anon;
grant execute on function public.owns_client(uuid) to authenticated;

alter table public.sessions enable row level security;

revoke all on public.sessions from anon, authenticated;
grant select, delete on public.sessions to authenticated;
grant insert (client_id, title, starts_at, duration_minutes, location, notes, status) on public.sessions to authenticated;
grant update (client_id, title, starts_at, duration_minutes, location, notes, status) on public.sessions to authenticated;

create policy sessions_select_own on public.sessions
  for select to authenticated using (trainer_id = (select auth.uid()));
create policy sessions_insert_own on public.sessions
  for insert to authenticated
  with check (trainer_id = (select auth.uid()) and (select public.is_trainer()) and (select public.owns_client(client_id)));
create policy sessions_update_own on public.sessions
  for update to authenticated
  using (trainer_id = (select auth.uid()))
  with check (trainer_id = (select auth.uid()) and (select public.owns_client(client_id)));
create policy sessions_delete_own on public.sessions
  for delete to authenticated using (trainer_id = (select auth.uid()));
