-- The brand is now Voltrix (Ryan, 2026-10-08: "change the name to Voltrix").
-- Only the messages people can see change; what each function does stays the same.

comment on column public.profiles.is_admin is 'Voltrix owner. Set by hand in the database, never by the app.';

create or replace function public.admin_list_trainers()
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
    raise exception 'Only the Voltrix owner can see all trainers' using errcode = '42501';
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

create or replace function public.admin_set_free_access(trainer uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only the Voltrix owner can change free access' using errcode = '42501';
  end if;
  update public.profiles set free_access = enabled where id = trainer and role = 'trainer';
end;
$$;

create or replace function public.delete_my_client_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'client') then
    raise exception 'This is a Voltrix Coach account. Delete it in Voltrix Coach.' using errcode = '42501';
  end if;
  perform public.delete_my_account();
end;
$$;
