-- Trainers can use the Valtrix client app with the same account (Ryan, 2026-10-08:
-- "a trainer may also be allowed to create a client one"). A trainer who is added
-- as a client, by another trainer or by themselves, is linked like any client.

-- Link the signed-in person to every trainer who saved their (confirmed) email.
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
