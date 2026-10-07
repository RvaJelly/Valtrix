-- Valtrix Coach subscription: $50/month with a 3-day free trial.
-- These columns are written only by the server (billing webhooks later),
-- never by the app, so they are left out of the profiles update grant.
alter table public.profiles
  add column trial_ends_at timestamptz,
  add column subscription_status text not null default 'none'
    check (subscription_status in ('none', 'active', 'past_due', 'cancelled', 'expired')),
  add column subscription_expires_at timestamptz;

comment on column public.profiles.trial_ends_at is 'End of the 3-day free trial. Set once, when a trainer signs up.';
comment on column public.profiles.subscription_status is 'Mirror of the store or payment provider state. Written only by the server.';

-- Trainers who signed up before billing existed get a fresh 3-day trial.
update public.profiles set trial_ends_at = now() + interval '3 days' where role = 'trainer' and trial_ends_at is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_role text := case when new.raw_user_meta_data ->> 'role' = 'client' then 'client' else 'trainer' end;
begin
  insert into public.profiles (id, full_name, role, trial_ends_at)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    new_role,
    case when new_role = 'trainer' then now() + interval '3 days' end
  );
  return new;
end;
$$;

-- True while a trainer may use the app: in their trial or with a paid subscription.
create function public.has_coach_access()
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
        trial_ends_at > now()
        or (subscription_status in ('active', 'past_due', 'cancelled') and subscription_expires_at > now())
      )
  );
$$;

revoke execute on function public.has_coach_access() from public, anon;
grant execute on function public.has_coach_access() to authenticated;

-- Remove the temporary end-to-end test account.
delete from auth.users where email = 'e2e-trainer@valtrix.test';
