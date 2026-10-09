import { newId } from '@/lib/chat';
import type { Reel, ReportReason } from '@/lib/posts';
import { supabase } from '@/lib/supabase';

// Comments and shares on reels, and who liked a post. Counts only include what the
// person would see: nothing from people blocked either way, no hidden or reported comments.

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  body: string;
  created_at: string;
  is_mine: boolean;
  // Their own comment, or any comment on their own reel.
  can_delete: boolean;
  // Only on this phone: a comment still being posted, or one that failed.
  pending?: 'sending' | 'failed';
};

export type PostCounts = { like_count: number; comment_count: number; liked_by_me: boolean };

export type Liker = { user_id: string; name: string | null; avatar_url: string | null; created_at: string };

export const COMMENT_MAX = 500;
export const COMMENTS_PER_PAGE = 50;

// The text of a chat message that shares a reel. The database sets it, and the chat
// list shows it as the preview.
export const REEL_MESSAGE = '🎬 Reel';

// A message that shares a reel. The database sets shared_reel, and it stays true when the
// reel is deleted (post_id is then cleared), so the chat can say it is no longer available.
// A message someone types that happens to read "🎬 Reel" is just text.
export function isReelMessage(message: { kind: string; post_id?: string | null; shared_reel?: boolean }) {
  return message.kind === 'text' && (!!message.post_id || !!message.shared_reel);
}

// 999, 1.2K, 12K, 1.2M
export function compactCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${n < 10_000 ? (Math.floor(n / 100) / 10).toString() : Math.floor(n / 1000)}K`;
  return `${n < 10_000_000 ? (Math.floor(n / 100_000) / 10).toString() : Math.floor(n / 1_000_000)}M`;
}

// post_counts takes up to 100 posts at a time.
const COUNTS_BATCH = 100;

export async function loadCounts(postIds: string[]): Promise<Map<string, PostCounts>> {
  const counts = new Map<string, PostCounts>();
  const ids = [...new Set(postIds)];
  // Lots of stories (everyone's from the last day) can be more than one batch.
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += COUNTS_BATCH) batches.push(ids.slice(i, i + COUNTS_BATCH));
  const results = await Promise.all(batches.map((batch) => supabase.rpc('post_counts', { p_ids: batch })));
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of (data ?? []) as (PostCounts & { post_id: string })[]) {
      counts.set(row.post_id, {
        like_count: Number(row.like_count),
        comment_count: Number(row.comment_count),
        liked_by_me: !!row.liked_by_me,
      });
    }
  }
  return counts;
}

// Reels by id, for reels sent in a chat. Reels the person can't see (deleted, hidden,
// reported or from someone blocked) are left out.
export async function loadReelsByIds(ids: string[]): Promise<Reel[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.rpc('reels_by_ids', { p_ids: ids.slice(0, 100) });
  if (error) throw error;
  return ((data ?? []) as Reel[]).map((r) => ({
    ...r,
    like_count: Number(r.like_count),
    comment_count: Number(r.comment_count),
    duration_seconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
  }));
}

// Newest first. Pass the oldest comment's time to get the ones before it.
export async function loadComments(postId: string, before?: string): Promise<PostComment[]> {
  const { data, error } = await supabase.rpc(
    'post_comments_for',
    before ? { p_post: postId, p_before: before } : { p_post: postId },
  );
  if (error) throw error;
  return (data ?? []) as PostComment[];
}

export async function addComment(id: string, postId: string, body: string) {
  const { error } = await supabase.from('post_comments').insert({ id, post_id: postId, body: body.trim() });
  // Sent twice (a retry after a slow network): the first one arrived.
  if (error && error.code !== '23505') throw error;
}

export async function deleteComment(id: string) {
  const { error } = await supabase.from('post_comments').delete().eq('id', id);
  if (error) throw error;
}

export async function reportComment(id: string, reason: ReportReason) {
  const { error } = await supabase.from('comment_reports').insert({ comment_id: id, reason });
  // Reported twice (a retry after a slow network): the first one arrived.
  if (!error || error.code === '23505') return;
  // Deleted meanwhile, or no longer something this person can see (for example after a block).
  if (error.code === '42501' || error.code === '23503') throw new Error("This comment can't be reported any more.");
  throw error;
}

// Who liked one of your own posts, newest first.
export async function loadLikers(postId: string): Promise<Liker[]> {
  const { data, error } = await supabase.rpc('post_likers', { p_post: postId });
  if (error) throw error;
  return (data ?? []) as Liker[];
}

// Sends a reel in a chat. The database checks the reel can be shared and sets the text.
export async function sendReelInChat(chatId: string, postId: string) {
  const { error } = await supabase
    .from('messages')
    .insert({ id: newId(), chat_id: chatId, kind: 'text', body: REEL_MESSAGE, post_id: postId });
  if (error) throw error;
}
