-- Valtrix client app: a client signs up with the email their trainer saved,
-- and is linked to that trainer. Clients read their trainer and sessions only
-- through these functions, so the trainer's private notes stay hidden.

-- Link the signed-in client to every trainer who saved their (confirmed) email.
create or replace function public.claim_my_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_email text;
  linked integer;
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = me and role = 'client') then
    return 0;
  end if;
  select email into my_email from auth.users where id = me and email_confirmed_at is not null;
  if my_email is null then
    return 0;
  end if;
  update public.clients
     set user_id = me
   where user_id is null
     and status <> 'archived'
     and lower(email) = lower(my_email);
  get diagnostics linked = row_count;
  return linked;
end;
$$;

revoke execute on function public.claim_my_invites() from public, anon;
grant execute on function public.claim_my_invites() to authenticated;

-- The trainers the signed-in client is linked to.
create or replace function public.my_trainers()
returns table (
  client_id uuid,
  trainer_id uuid,
  trainer_name text,
  business_name text,
  client_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, p.id, p.full_name, p.business_name, c.status
    from public.clients c
    join public.profiles p on p.id = c.trainer_id
   where c.user_id = auth.uid()
     and c.status <> 'archived'
   order by c.created_at;
$$;

revoke execute on function public.my_trainers() from public, anon;
grant execute on function public.my_trainers() to authenticated;

-- The signed-in client's sessions between two times (at most about a year),
-- without the trainer's notes.
create or replace function public.my_sessions(range_start timestamptz, range_end timestamptz)
returns table (
  id uuid,
  starts_at timestamptz,
  duration_minutes int,
  location text,
  status text,
  trainer_name text,
  business_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.duration_minutes, s.location, s.status, p.full_name, p.business_name
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

revoke execute on function public.my_sessions(timestamptz, timestamptz) from public, anon;
grant execute on function public.my_sessions(timestamptz, timestamptz) to authenticated;
