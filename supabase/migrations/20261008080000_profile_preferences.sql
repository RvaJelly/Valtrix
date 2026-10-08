-- App preferences (theme, colour, units, reminder time) saved with the account,
-- so a trainer gets them back when they sign in on a new phone.
alter table public.profiles add column if not exists preferences jsonb not null default '{}'::jsonb;

alter table public.profiles drop constraint if exists profiles_preferences_is_object;
alter table public.profiles add constraint profiles_preferences_is_object
  check (jsonb_typeof(preferences) = 'object' and pg_column_size(preferences) < 4096);

grant update (preferences) on public.profiles to authenticated;
