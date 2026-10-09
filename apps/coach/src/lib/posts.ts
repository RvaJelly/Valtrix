import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PickedMedia } from '@/lib/media';
import { loadCounts } from '@/lib/social';
import { supabase } from '@/lib/supabase';

// Stories last 24 hours; reels are short videos that stay up. Trainers here and
// clients in the Voltrix app share one feed, so everyone sees everyone's posts,
// apart from people they blocked or who blocked them.

export type Story = {
  id: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  media_path: string;
  media_type: 'image' | 'video';
  duration_seconds: number | null;
  created_at: string;
  is_mine: boolean;
};

// One person's stories, oldest first, as they play in the viewer.
export type StoryGroup = {
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  is_mine: boolean;
  stories: Story[];
};

export type Reel = {
  id: string;
  author_id: string;
  author_name: string | null;
  author_avatar: string | null;
  media_path: string;
  caption: string | null;
  duration_seconds: number | null;
  created_at: string;
  like_count: number;
  liked_by_me: boolean;
  is_mine: boolean;
  comment_count: number;
};

export type ReportReason = 'spam' | 'nudity' | 'violence' | 'hate' | 'bullying' | 'other';

export const REPORT_REASONS: Record<ReportReason, string> = {
  spam: 'Spam or scam',
  nudity: 'Nudity or sexual content',
  violence: 'Violence or dangerous acts',
  hate: 'Hate speech or symbols',
  bullying: 'Bullying or harassment',
  other: 'Something else',
};

const BUCKET = 'posts';

export function mediaUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function authorName(post: { author_name: string | null }) {
  return post.author_name || 'Voltrix member';
}

// "now", "5m", "3h", "2d"
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export async function loadStories(): Promise<StoryGroup[]> {
  const { data, error } = await supabase.rpc('feed_stories');
  if (error) throw error;
  const groups: StoryGroup[] = [];
  for (const row of (data ?? []) as Story[]) {
    const story = { ...row, duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds) };
    const last = groups.at(-1);
    if (last?.author_id === story.author_id) last.stories.push(story);
    else
      groups.push({
        author_id: story.author_id,
        author_name: story.author_name,
        author_avatar: story.author_avatar,
        is_mine: story.is_mine,
        stories: [story],
      });
  }
  return groups;
}

// Newest first, 20 at a time. Pass the oldest reel's time to get the next 20.
export async function loadReels(before?: string): Promise<Reel[]> {
  const { data, error } = await supabase.rpc('feed_reels', before ? { before } : {});
  if (error) throw error;
  const reels = ((data ?? []) as Reel[]).map((r) => ({
    ...r,
    like_count: Number(r.like_count),
    comment_count: 0,
    duration_seconds: r.duration_seconds == null ? null : Number(r.duration_seconds),
  }));
  // Comment counts come separately. Without them the reels still show.
  const counts = await loadCounts(reels.map((r) => r.id)).catch(() => null);
  return reels.map((r) => {
    const c = counts?.get(r.id);
    return c ? { ...r, like_count: c.like_count, liked_by_me: c.liked_by_me, comment_count: c.comment_count } : r;
  });
}

export async function setLiked(postId: string, liked: boolean) {
  const { error } = liked
    ? await supabase.from('post_likes').insert({ post_id: postId })
    : await supabase.from('post_likes').delete().eq('post_id', postId);
  // Liking twice (for example from two phones) is not an error.
  if (error && error.code !== '23505') throw error;
}

export async function reportPost(postId: string, reason: ReportReason) {
  const { error } = await supabase.from('post_reports').insert({ post_id: postId, reason });
  if (error && error.code !== '23505') throw error;
}

export async function blockPerson(personId: string) {
  const { error } = await supabase.from('user_blocks').insert({ blocked_id: personId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockPerson(personId: string) {
  const { error } = await supabase.from('user_blocks').delete().eq('blocked_id', personId);
  if (error) throw error;
}

export type Blocked = { blocked_id: string; name: string | null; avatar_url: string | null };

export async function loadBlocked() {
  const { data, error } = await supabase.rpc('my_blocks');
  if (error) throw error;
  return (data ?? []) as Blocked[];
}

export async function deletePost(post: { id: string; media_path: string }) {
  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;
  // Best effort: the post is gone from every feed either way.
  await supabase.storage
    .from(BUCKET)
    .remove([post.media_path])
    .catch(() => {});
}

// Goes up each time this phone shares a post, so feeds know to reload.
let shared = 0;
export function sharedCount() {
  return shared;
}

// Uploads the photo or video to the person's own folder, then shares it.
export async function createPost(
  userId: string,
  kind: 'story' | 'reel',
  media: PickedMedia,
  caption: string | null,
): Promise<void> {
  const name =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const path = `${userId}/${name}.${media.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, media.bytes, { contentType: media.mimeType });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('posts').insert({
    kind,
    media_path: path,
    media_type: media.type,
    caption: caption?.trim() || null,
    duration_seconds: media.durationSeconds,
  });
  if (error) {
    await supabase.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => {});
    throw error;
  }
  shared++;
}

// Which stories this phone has already shown, so new ones get an orange ring.
// The keys below use the old brand name, like the app's other saved settings.
const SEEN_KEY = 'valtrix.seenStories';

export async function loadSeen(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export async function markSeen(id: string) {
  const seen = await loadSeen();
  if (seen.has(id)) return;
  // Stories last a day, so the most recent few hundred are plenty to remember.
  const kept = [...seen, id].slice(-500);
  await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(kept)).catch(() => {});
}

// People agree to the community rules once, before their first post.
const RULES_KEY = 'valtrix.communityRules';

export async function hasAcceptedRules() {
  return (await AsyncStorage.getItem(RULES_KEY).catch(() => null)) === 'yes';
}

export async function acceptRules() {
  await AsyncStorage.setItem(RULES_KEY, 'yes').catch(() => {});
}
