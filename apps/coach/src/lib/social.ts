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
// list shows it as the preview. A message with this text and no reel is a reel that was deleted.
export const REEL_MESSAGE = '🎬 Reel';

export function isReelMessage(message: { kind: string; body: string | null; post_id?: string | null }) {
  return message.kind === 'text' && (!!message.post_id || message.body === REEL_MESSAGE);
}

// 999, 1.2K, 12K, 1.2M
export function compactCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${n < 10_000 ? (Math.floor(n / 100) / 10).toString() : Math.floor(n / 1000)}K`;
  return `${n < 10_000_000 ? (Math.floor(n / 100_000) / 10).toString() : Math.floor(n / 1_000_000)}M`;
}

export async function loadCounts(postIds: string[]): Promise<Map<string, PostCounts>> {
  const counts = new Map<string, PostCounts>();
  if (!postIds.length) return counts;
  const { data, error } = await supabase.rpc('post_counts', { p_ids: postIds.slice(0, 100) });
  if (error) throw error;
  for (const row of (data ?? []) as (PostCounts & { post_id: string })[]) {
    counts.set(row.post_id, {
      like_count: Number(row.like_count),
      comment_count: Number(row.comment_count),
      liked_by_me: !!row.liked_by_me,
    });
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
  if (error && error.code !== '23505') throw error;
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
