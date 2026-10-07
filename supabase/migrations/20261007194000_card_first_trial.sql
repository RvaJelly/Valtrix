-- Card first: a new trainer starts with no trial. The 3-day trial begins when
-- they add a card on the Subscribe screen (the billing server sets
-- trial_ends_at then), and the monthly charge follows automatically.
create or replace function public.handle_new_user()
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
