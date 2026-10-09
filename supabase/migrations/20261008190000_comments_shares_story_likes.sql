-- Comments and shares on reels, and likes on stories (Ryan, 2026-10-08: "with the
-- reels make sure there is a like button and a comment one and a share one and on
-- the storie there must also be a like button").
--
-- Comments work like posts: people can report them (three reports hide one), and
-- comments from people blocked in either direction are hidden. A reel can be sent
-- in a chat as a message that points at it (messages.post_id).
--
-- The feed functions return fixed columns, so the counts come from new functions.

-- ---------- Who can see a post ----------

-- Can the signed-in person see this post? Their own always; someone else's while it
-- isn't hidden, its author isn't blocked either way, they haven't reported it, and
-- (for a story) it hasn't expired. The same rules as feed_stories() and feed_reels().
create function public.can_see_post(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
     where p.id = p_post
       and auth.uid() is not null
       and (p.kind = 'reel' or p.expires_at > now())
       and (p.author_id = auth.uid() or (
         not p.hidden
         and public.can_see_author(p.author_id)
         and not exists (select 1 from public.post_reports r where r.post_id = p.id and r.reporter_id = auth.uid())
       ))
  );
$$;

revoke execute on function public.can_see_post(uuid) from public, anon;
grant execute on function public.can_see_post(uuid) to authenticated;

-- ---------- Likes ----------

-- post_likes already works for stories as well as reels (nothing limits the kind).
-- Only allow liking a post the person can actually see.
alter policy post_likes_insert_own on public.post_likes
  with check (user_id = (select auth.uid()) and (select public.can_see_post(post_id)));

-- ---------- Comments ----------

create table public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  -- Set when enough people report a comment.
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index post_comments_post_idx on public.post_comments (post_id, created_at desc);
create index post_comments_author_idx on public.post_comments (author_id);

-- The server decides the time and the hidden flag, and trims spaces off the ends.
create function public.post_comments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  new.hidden := false;
  new.created_at := clock_timestamp();
  return new;
end;
$$;

create trigger post_comments_before_insert before insert on public.post_comments
  for each row execute function public.post_comments_before_insert();

create table public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('spam', 'nudity', 'violence', 'hate', 'bullying', 'other')),
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);

create index comment_reports_reporter_idx on public.comment_reports (reporter_id);

-- Three reports from different people hide a comment, like posts.
create function public.hide_reported_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.comment_reports where comment_id = new.comment_id) >= 3 then
    update public.post_comments set hidden = true where id = new.comment_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.hide_reported_comment() from public, anon, authenticated;

create trigger comment_reports_hide after insert on public.comment_reports
  for each row execute function public.hide_reported_comment();

-- People can comment on reels they can see.
create function public.can_comment_on(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_see_post(p_post)
     and exists (select 1 from public.posts p where p.id = p_post and p.kind = 'reel');
$$;

revoke execute on function public.can_comment_on(uuid) from public, anon;
grant execute on function public.can_comment_on(uuid) to authenticated;

alter table public.post_comments enable row level security;
alter table public.comment_reports enable row level security;

revoke all on public.post_comments, public.comment_reports from anon, authenticated;
-- Reading is needed to delete by id. The lists come from post_comments_for(), which adds names.
grant select, delete on public.post_comments to authenticated;
-- The app picks the id so a comment it shows straight away can be matched with the saved one.
grant insert (id, post_id, body) on public.post_comments to authenticated;
grant insert (comment_id, reason) on public.comment_reports to authenticated;

-- People see their own comments and the comments on their own posts (to remove them),
-- apart from comments by people blocked either way: a blocked person can't read the
-- words of the person who blocked them, even on their own reel.
create policy post_comments_select on public.post_comments
  for select to authenticated
  using (
    author_id = (select auth.uid())
    or (
      exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
      and public.can_see_author(author_id)
    )
    or (select public.is_admin())
  );

create policy post_comments_insert_own on public.post_comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.can_comment_on(post_id)));

-- People remove their own comments; a reel's author can remove any comment on it that
-- they can see. (posts only shows people their own posts, so the check below finds only those.)
create policy post_comments_delete on public.post_comments
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or (
      exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
      and public.can_see_author(author_id)
    )
    or (select public.is_admin())
  );

-- Can the signed-in person report this comment? Only someone else's comment on a reel
-- they can see, from someone not blocked either way. A comment that is already hidden
-- can still be reported (it may still be on their screen).
create function public.can_report_comment(p_comment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.post_comments c
     where c.id = p_comment
       and auth.uid() is not null
       and c.author_id <> auth.uid()
       and public.can_see_author(c.author_id)
       and public.can_see_post(c.post_id)
  );
$$;

revoke execute on function public.can_report_comment(uuid) from public, anon;
grant execute on function public.can_report_comment(uuid) to authenticated;

create policy comment_reports_insert_own on public.comment_reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()) and public.can_report_comment(comment_id));

-- A post's comments, newest first, 50 at a time. Pass the oldest created_at you have to get more.
-- Hidden comments, comments the person reported and comments from people blocked
-- either way are left out (people still see their own).
create function public.post_comments_for(p_post uuid, p_before timestamptz default null)
returns table (
  id uuid,
  post_id uuid,
  author_id uuid,
  author_name text,
  author_avatar text,
  body text,
  created_at timestamptz,
  is_mine boolean,
  can_delete boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.post_id, c.author_id, coalesce(a.full_name, a.business_name), a.avatar_url,
         c.body, c.created_at, c.author_id = auth.uid(),
         c.author_id = auth.uid() or p.author_id = auth.uid() or (select public.is_admin())
    from public.post_comments c
    join public.posts p on p.id = c.post_id
    join public.profiles a on a.id = c.author_id
   where auth.uid() is not null
     and c.post_id = p_post
     and public.can_see_post(p_post)
     and (p_before is null or c.created_at < p_before)
     and (c.author_id = auth.uid() or (
       not c.hidden
       and public.can_see_author(c.author_id)
       and not exists (select 1 from public.comment_reports r where r.comment_id = c.id and r.reporter_id = auth.uid())
     ))
   order by c.created_at desc
   limit 50;
$$;

revoke execute on function public.post_comments_for(uuid, timestamptz) from public, anon;
grant execute on function public.post_comments_for(uuid, timestamptz) to authenticated;

-- ---------- Counts ----------

-- Likes and comments for up to 100 posts the person can see, counting only what
-- they would see (nothing from people blocked either way, no hidden or reported comments).
create function public.post_counts(p_ids uuid[])
returns table (post_id uuid, like_count bigint, comment_count bigint, liked_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         (select count(*) from public.post_likes l
           where l.post_id = p.id
             and not exists (select 1 from public.user_blocks b
                              where (b.blocker_id = auth.uid() and b.blocked_id = l.user_id)
                                 or (b.blocker_id = l.user_id and b.blocked_id = auth.uid()))),
         (select count(*) from public.post_comments c
           where c.post_id = p.id
             and (c.author_id = auth.uid() or (
               not c.hidden
               and not exists (select 1 from public.user_blocks b
                                where (b.blocker_id = auth.uid() and b.blocked_id = c.author_id)
                                   or (b.blocker_id = c.author_id and b.blocked_id = auth.uid()))
               and not exists (select 1 from public.comment_reports r
                                where r.comment_id = c.id and r.reporter_id = auth.uid())))),
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid())
    from public.posts p
   where auth.uid() is not null
     and p.id = any (p_ids[1:100])
     and public.can_see_post(p.id);
$$;

revoke execute on function public.post_counts(uuid[]) from public, anon;
grant execute on function public.post_counts(uuid[]) to authenticated;

-- Who liked one of the person's own posts (for "Liked by" on their story), newest first.
-- Only the author can ask, and people blocked either way are left out.
create function public.post_likers(p_post uuid)
returns table (user_id uuid, name text, avatar_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id, coalesce(a.full_name, a.business_name), a.avatar_url, l.created_at
    from public.post_likes l
    join public.posts p on p.id = l.post_id
    join public.profiles a on a.id = l.user_id
   where auth.uid() is not null
     and p.id = p_post
     and p.author_id = auth.uid()
     and public.can_see_author(l.user_id)
   order by l.created_at desc
   limit 500;
$$;

revoke execute on function public.post_likers(uuid) from public, anon;
grant execute on function public.post_likers(uuid) to authenticated;

-- ---------- Reels by id ----------

-- Up to 100 reels by id, with the same columns as feed_reels() plus the comment count,
-- for reels sent in a chat and the full-screen reel. Reels the person can't see are left out.
create function public.reels_by_ids(p_ids uuid[])
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
  is_mine boolean,
  comment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.author_id, coalesce(a.full_name, a.business_name), a.avatar_url,
         p.media_path, p.caption, p.duration_seconds, p.created_at,
         k.like_count, k.liked_by_me, p.author_id = auth.uid(), k.comment_count
    from public.posts p
    join public.profiles a on a.id = p.author_id
    join public.post_counts(array[p.id]) k on k.post_id = p.id
   where auth.uid() is not null
     and p.kind = 'reel'
     and p.id = any (p_ids[1:100]);
$$;

revoke execute on function public.reels_by_ids(uuid[]) from public, anon;
grant execute on function public.reels_by_ids(uuid[]) to authenticated;

-- ---------- Sending a reel in a chat ----------

-- A chat message can point at a reel; the apps show it as a card that opens the reel.
-- If the reel is deleted later the link is cleared, and shared_reel (which stays true)
-- tells the apps to say it is no longer available. A typed message that happens to
-- read "🎬 Reel" has shared_reel false, so it shows as normal text.
alter table public.messages
  add column post_id uuid references public.posts (id) on delete set null,
  add column shared_reel boolean not null default false;

create index messages_post_idx on public.messages (post_id) where post_id is not null;

-- shared_reel is set by the trigger below only.
grant insert (post_id) on public.messages to authenticated;

-- Only a reel the sender can see (not hidden, no block either way, not reported by
-- them) can be sent, as a text message. The text is always the same short line, so
-- the chat list reads "🎬 Reel".
create function public.messages_check_shared_reel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.post_id is null then
    new.shared_reel := false;
    return new;
  end if;
  if new.kind <> 'text' then
    raise exception 'A reel can only be sent as a text message' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.posts p
     where p.id = new.post_id
       and p.kind = 'reel'
       and not p.hidden
       and not exists (select 1 from public.user_blocks b
                        where (b.blocker_id = new.sender_id and b.blocked_id = p.author_id)
                           or (b.blocker_id = p.author_id and b.blocked_id = new.sender_id))
       and not exists (select 1 from public.post_reports r where r.post_id = p.id and r.reporter_id = new.sender_id)
  ) then
    raise exception 'This reel can''t be shared' using errcode = '42501';
  end if;
  new.body := '🎬 Reel';
  new.media_path := null;
  new.shared_reel := true;
  return new;
end;
$$;

revoke execute on function public.messages_check_shared_reel() from public, anon, authenticated;

create trigger messages_check_shared_reel before insert on public.messages
  for each row execute function public.messages_check_shared_reel();
