-- Valtrix stories and reels, like Instagram. Stories last 24 hours; reels are
-- short videos. Everyone signed in to Valtrix can see them. People can like,
-- report and block (Apple and Google require reporting and blocking for posts).

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('story', 'reel')),
  -- Path inside the "posts" storage bucket, always in the author's own folder.
  media_path text not null check (char_length(media_path) between 1 and 300),
  media_type text not null check (media_type in ('image', 'video')),
  caption text check (caption is null or char_length(caption) <= 2200),
  duration_seconds numeric(6, 2) check (duration_seconds is null or duration_seconds between 0 and 61),
  -- Set when enough people report a post, or by the owner.
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  -- Stories disappear 24 hours after posting; reels never expire.
  expires_at timestamptz,
  check (kind = 'story' or media_type = 'video')
);

create index posts_reels_idx on public.posts (created_at desc) where kind = 'reel';
create index posts_stories_idx on public.posts (expires_at) where kind = 'story';
create index posts_author_idx on public.posts (author_id);

-- The server decides the time, the expiry and the hidden flag.
create function public.posts_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.hidden := false;
  new.expires_at := case when new.kind = 'story' then now() + interval '24 hours' else null end;
  return new;
end;
$$;

create trigger posts_before_insert before insert on public.posts
  for each row execute function public.posts_before_insert();

create table public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_user_idx on public.post_likes (user_id);

create table public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'nudity', 'violence', 'hate', 'bullying', 'other')),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create index post_reports_reporter_idx on public.post_reports (reporter_id);

-- Three reports from different people hide a post until the owner looks at it.
create function public.hide_reported_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.post_reports where post_id = new.post_id) >= 3 then
    update public.posts set hidden = true where id = new.post_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.hide_reported_post() from public, anon, authenticated;

create trigger post_reports_hide after insert on public.post_reports
  for each row execute function public.hide_reported_post();

create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

-- Row level security: people only touch their own rows directly. Feeds come
-- from the functions below, which add names and photos.
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_reports enable row level security;
alter table public.user_blocks enable row level security;

revoke all on public.posts, public.post_likes, public.post_reports, public.user_blocks from anon, authenticated;
grant select, delete on public.posts to authenticated;
grant insert (kind, media_path, media_type, caption, duration_seconds) on public.posts to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant insert (post_id, reason) on public.post_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

create policy posts_select_own on public.posts
  for select to authenticated using (author_id = (select auth.uid()));
create policy posts_insert_own on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and split_part(media_path, '/', 1) = (select auth.uid())::text);
create policy posts_delete_own on public.posts
  for delete to authenticated using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy post_likes_select_own on public.post_likes
  for select to authenticated using (user_id = (select auth.uid()));
create policy post_likes_insert_own on public.post_likes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy post_likes_delete_own on public.post_likes
  for delete to authenticated using (user_id = (select auth.uid()));

create policy post_reports_insert_own on public.post_reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));

create policy user_blocks_select_own on public.user_blocks
  for select to authenticated using (blocker_id = (select auth.uid()));
create policy user_blocks_insert_own on public.user_blocks
  for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy user_blocks_delete_own on public.user_blocks
  for delete to authenticated using (blocker_id = (select auth.uid()));

-- Can the signed-in person see posts by this author? Not if either has blocked the other.
create function public.can_see_author(p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.user_blocks
     where (blocker_id = auth.uid() and blocked_id = p_author)
        or (blocker_id = p_author and blocked_id = auth.uid())
  );
$$;

revoke execute on function public.can_see_author(uuid) from public, anon;
grant execute on function public.can_see_author(uuid) to authenticated;

-- Stories from the last 24 hours, grouped by author (oldest first within each).
create function public.feed_stories()
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  media_path text,
  media_type text,
  duration_seconds numeric,
  created_at timestamptz,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.author_id, coalesce(a.full_name, a.business_name), a.avatar_url,
         p.media_path, p.media_type, p.duration_seconds, p.created_at, p.author_id = auth.uid()
    from public.posts p
    join public.profiles a on a.id = p.author_id
   where auth.uid() is not null
     and p.kind = 'story'
     and p.expires_at > now()
     and (p.author_id = auth.uid() or (
       not p.hidden
       and public.can_see_author(p.author_id)
       and not exists (select 1 from public.post_reports r where r.post_id = p.id and r.reporter_id = auth.uid())
     ))
   order by (p.author_id = auth.uid()) desc, p.author_id, p.created_at;
$$;

revoke execute on function public.feed_stories() from public, anon;
grant execute on function public.feed_stories() to authenticated;

-- Reels, newest first, 20 at a time. Pass the oldest created_at you have to get more.
create function public.feed_reels(before timestamptz default null)
returns table (
  id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  media_path text,
  caption text,
  duration_seconds numeric,
  created_at timestamptz,
  like_count bigint,
  liked_by_me boolean,
  is_mine boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.author_id, coalesce(a.full_name, a.business_name), a.avatar_url,
         p.media_path, p.caption, p.duration_seconds, p.created_at,
         (select count(*) from public.post_likes l where l.post_id = p.id),
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         p.author_id = auth.uid()
    from public.posts p
    join public.profiles a on a.id = p.author_id
   where auth.uid() is not null
     and p.kind = 'reel'
     and (before is null or p.created_at < before)
     and (p.author_id = auth.uid() or (
       not p.hidden
       and public.can_see_author(p.author_id)
       and not exists (select 1 from public.post_reports r where r.post_id = p.id and r.reporter_id = auth.uid())
     ))
   order by p.created_at desc
   limit 20;
$$;

revoke execute on function public.feed_reels(timestamptz) from public, anon;
grant execute on function public.feed_reels(timestamptz) to authenticated;

-- The people the signed-in person has blocked, with names, for Settings.
create function public.my_blocks()
returns table (blocked_id uuid, name text, avatar_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.blocked_id, coalesce(p.full_name, p.business_name), p.avatar_url, b.created_at
    from public.user_blocks b
    join public.profiles p on p.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;

revoke execute on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- Photos and videos for posts: anyone signed in can view (the bucket is public
-- so videos stream), and each person can only add or remove files in their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'posts', 'posts', true, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;

create policy posts_media_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy posts_media_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Removing a file through the storage API also needs read access to it.
create policy posts_media_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'posts' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
