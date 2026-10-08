-- The Valtrix client app deletes accounts through this function, which refuses
-- trainer accounts: trainers can sign in to Valtrix too, and deleting there would
-- wipe their clients and calendar. Trainers delete their account in Valtrix Coach.
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
    raise exception 'This is a Valtrix Coach account. Delete it in Valtrix Coach.' using errcode = '42501';
  end if;
  perform public.delete_my_account();
end;
$$;

revoke execute on function public.delete_my_client_account() from public, anon;
grant execute on function public.delete_my_client_account() to authenticated;
