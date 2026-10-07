-- Lets a trainer delete their own account from Settings (Google Play and the
-- App Store require this). Profiles, clients, exercises and workouts cascade
-- from auth.users; workouts go first because workout_exercises restricts
-- deleting an exercise that a workout still uses.
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from public.workouts where trainer_id = me;
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
