-- Trainer profiles that clients see in the Valtrix app: a photo, specialties,
-- a short bio, city and years of experience.
alter table public.profiles
  add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500),
  add column if not exists specialties text[] not null default '{}'
    check (cardinality(specialties) <= 8 and char_length(array_to_string(specialties, ',')) <= 400),
  add column if not exists bio text check (bio is null or char_length(bio) <= 1000),
  add column if not exists city text check (city is null or char_length(city) <= 100),
  add column if not exists years_experience int check (years_experience is null or years_experience between 0 and 60);

grant update (avatar_url, specialties, bio, city, years_experience) on public.profiles to authenticated;

-- Profile photos: anyone can view, each person can only change files in their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Every trainer with an active plan (paid, trial, free access or the owner),
-- for the trainer list in the client app. Only public profile fields.
create or replace function public.list_trainers()
returns table (
  id uuid,
  full_name text,
  business_name text,
  avatar_url text,
  specialties text[],
  bio text,
  city text,
  years_experience int
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.business_name, p.avatar_url, p.specialties, p.bio, p.city, p.years_experience
    from public.profiles p
   where p.role = 'trainer'
     and p.business_name is not null
     and (
       p.free_access
       or p.is_admin
       or p.trial_ends_at > now()
       or (p.subscription_status in ('active', 'past_due', 'cancelled') and p.subscription_expires_at > now())
     )
   order by p.full_name nulls last, p.business_name;
$$;

revoke execute on function public.list_trainers() from public, anon;
grant execute on function public.list_trainers() to authenticated;
