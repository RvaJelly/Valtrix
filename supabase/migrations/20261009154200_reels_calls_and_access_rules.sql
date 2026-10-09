-- Fixes from testing everything (2026-10-09):
--   * Reels and stories take MP4 and MOV only. iPhones can't play WebM, so a WebM
--     reel posted from a computer would never play on an iPhone.
--   * A trainer without a trial, plan or free access can't add clients, workouts,
--     exercises, sessions, plans or workout videos through the API either (the Coach
--     app already shows them the Subscribe screen). Reading and changing what they
--     already have still works, so clients keep their plans if a trainer's plan lapses.
--   * Reports on a reel or story need someone who can see it: not their own, not from
--     someone blocked either way, and not a story that has run out.
--   * The owner can see every post, so the owner's delete rule for posts works.
--   * Answering a call says whether this tap answered it. With the same login on two
--     devices, the second one to answer now stops instead of joining the call too.

-- ---------- Reels and stories: MP4 and MOV only ----------

update storage.buckets
   set allowed_mime_types = array_remove(allowed_mime_types, 'video/webm')
 where id = 'posts';

-- ---------- Adding things needs an active trial, plan or free access ----------

alter policy clients_insert_own on public.clients
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.has_coach_access())
  );

alter policy exercises_insert_own on public.exercises
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.has_coach_access())
  );

alter policy workouts_insert_own on public.workouts
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.has_coach_access())
  );

alter policy sessions_insert_own on public.sessions
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.owns_client(client_id))
    and (select public.has_coach_access())
  );

alter policy plan_items_insert_own on public.plan_items
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.owns_client(client_id))
    and (select public.owns_workout(workout_id))
    and (select public.has_coach_access())
  );

alter policy nutrition_plans_insert_own on public.nutrition_plans
  with check (
    trainer_id = (select auth.uid())
    and (select public.is_trainer())
    and (select public.owns_client(client_id))
    and (select public.has_coach_access())
  );

alter policy workout_videos_insert_own on storage.objects
  with check (
    bucket_id = 'workout-videos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_trainer())
    and (select public.has_coach_access())
  );

-- ---------- Reports on reels and stories ----------

-- Can the signed-in person report this post? Only one they could see: someone else's,
-- not from a person blocked either way, and not a story that has run out. Reporting
-- twice is still refused by the unique (post_id, reporter_id) rule, which the apps
-- treat as done.
create or replace function public.can_report_post(p_post uuid)
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
       and p.author_id <> auth.uid()
       and (p.kind = 'reel' or p.expires_at > now())
       and public.can_see_author(p.author_id)
  );
$$;

revoke execute on function public.can_report_post(uuid) from public, anon;
grant execute on function public.can_report_post(uuid) to authenticated;

alter policy post_reports_insert_own on public.post_reports
  with check (reporter_id = (select auth.uid()) and (select public.can_report_post(post_id)));

-- ---------- The owner can see every post ----------

-- posts_delete_own already lets the owner delete any post, but a delete only reaches
-- rows the person can select.
alter policy posts_select_own on public.posts
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- ---------- Answering a call on one of two devices ----------

-- Same as before, plus "answered_here" in the reply to 'accept': true only when this
-- call is what answered it. A second device with the same login gets false, and the
-- apps then show "Answered on another device." instead of joining.
create or replace function public.update_call(p_call uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  k public.calls;
  answered_here boolean := false;
begin
  select * into k from public.calls where id = p_call and (caller_id = me or callee_id = me) for update;
  if not found then
    raise exception 'Call not found' using errcode = '42501';
  end if;

  if p_action = 'accept' then
    if k.callee_id = me and k.status = 'ringing' then
      if k.created_at < now() - interval '60 seconds' then
        k := public.finish_call(k.id, 'missed');
      else
        update public.calls set status = 'accepted', answered_at = now() where id = k.id returning * into k;
        answered_here := true;
        perform public.announce_call(k);
      end if;
    end if;
    return public.call_payload(k) || jsonb_build_object('answered_here', answered_here);
  elsif p_action = 'decline' then
    if k.callee_id = me and k.status = 'ringing' then
      k := public.finish_call(k.id, 'declined');
    end if;
  elsif p_action in ('cancel', 'missed') then
    if k.caller_id = me and k.status = 'ringing' then
      k := public.finish_call(k.id, case when p_action = 'missed' then 'missed' else 'cancelled' end);
    end if;
  elsif p_action = 'end' then
    if k.status = 'accepted' then
      k := public.finish_call(k.id, 'ended');
    elsif k.status = 'ringing' then
      k := public.finish_call(k.id, case when k.caller_id = me then 'cancelled' else 'declined' end);
    end if;
  else
    raise exception 'Unknown call action %', p_action using errcode = '22023';
  end if;
  return public.call_payload(k);
end;
$$;

revoke execute on function public.update_call(uuid, text) from public, anon;
grant execute on function public.update_call(uuid, text) to authenticated;
