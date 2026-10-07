-- Owner tools: the Valtrix owner (is_admin) can see every trainer and give
-- any of them free access. Both columns are server-only, like the
-- subscription columns, so they stay out of the profiles update grant.
alter table public.profiles
  add column is_admin boolean not null default false,
  add column free_access boolean not null default false;

comment on column public.profiles.is_admin is 'Valtrix owner. Set by hand in the database, never by the app.';
comment on column public.profiles.free_access is 'Free access granted by the owner. Overrides trial and subscription.';

create or replace function public.has_coach_access()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'trainer'
      and (
        free_access
        or is_admin
        or trial_ends_at > now()
        or (subscription_status in ('active', 'past_due', 'cancelled') and subscription_expires_at > now())
      )
  );
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Every trainer with their plan and client count. Owner only.
create function public.admin_list_trainers()
returns table (
  id uuid,
  full_name text,
  business_name text,
  email text,
  created_at timestamptz,
  trial_ends_at timestamptz,
  subscription_status text,
  subscription_expires_at timestamptz,
  free_access boolean,
  is_admin boolean,
  client_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the Valtrix owner can see all trainers' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.business_name, u.email::text, p.created_at, p.trial_ends_at,
           p.subscription_status, p.subscription_expires_at, p.free_access, p.is_admin,
           (select count(*) from public.clients c where c.trainer_id = p.id and c.status <> 'archived')
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'trainer'
    order by p.created_at desc;
end;
$$;

-- Turn free access on or off for one trainer. Owner only.
create function public.admin_set_free_access(trainer uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the Valtrix owner can change free access' using errcode = '42501';
  end if;
  update public.profiles set free_access = enabled where id = trainer and role = 'trainer';
end;
$$;

revoke execute on function public.is_admin(), public.admin_list_trainers(), public.admin_set_free_access(uuid, boolean) from public, anon;
grant execute on function public.is_admin(), public.admin_list_trainers(), public.admin_set_free_access(uuid, boolean) to authenticated;
