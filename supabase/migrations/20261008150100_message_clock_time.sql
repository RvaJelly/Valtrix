-- Messages saved in the same moment kept the same time and could show in the wrong order.
-- Use the real clock instead of the transaction's start time.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := clock_timestamp();
  if new.kind <> 'call' then
    new.read_at := null;
  end if;
  return new;
end;
$$;
