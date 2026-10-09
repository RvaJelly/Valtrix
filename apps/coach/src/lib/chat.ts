import { CHAT_ROLE } from '@/lib/chat-role';
import { supabase } from '@/lib/supabase';

// Chat between a trainer (Voltrix Coach) and their client (Voltrix), like WhatsApp.
// A chat is one trainer-client link, so its id is the id of that client record.

export type CallInfo = {
  id: string;
  video: boolean;
  status: CallStatus;
  caller_id: string;
  answered_at: string | null;
  ended_at: string | null;
};

export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'cancelled' | 'busy' | 'ended';

export type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  kind: 'text' | 'image' | 'call';
  body: string | null;
  media_path: string | null;
  call_id: string | null;
  call?: CallInfo | null;
  // A reel sent in the chat. Cleared when the reel is deleted; shared_reel stays true.
  post_id?: string | null;
  shared_reel?: boolean;
  created_at: string;
  read_at: string | null;
  // Only on this phone: a message still being sent, or one that failed.
  pending?: 'sending' | 'failed';
  // A photo picked on this phone, shown until the upload is done.
  local_uri?: string;
};

export type ChatSummary = {
  chat_id: string;
  other_id: string;
  other_name: string;
  other_avatar: string | null;
  last_id: string | null;
  last_kind: Message['kind'] | null;
  last_body: string | null;
  last_sender_id: string | null;
  last_read_at: string | null;
  last_at: string | null;
  last_call_video: boolean | null;
  last_call_status: CallStatus | null;
  last_call_answered_at: string | null;
  last_call_ended_at: string | null;
  unread: number;
};

const MESSAGE_COLUMNS =
  'id, chat_id, sender_id, kind, body, media_path, call_id, post_id, shared_reel, created_at, read_at, call:calls(id, video, status, caller_id, answered_at, ended_at)';
const PAGE = 40;
const BUCKET = 'chat';

export function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Older phones: a random version 4 id.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function loadChats(): Promise<ChatSummary[]> {
  const { data, error } = await supabase.rpc('my_chats', { p_as: CHAT_ROLE });
  if (error) throw error;
  return ((data ?? []) as ChatSummary[]).map((c) => ({ ...c, unread: Number(c.unread) }));
}

// Newest first. Pass the oldest message's time to get the ones before it.
export async function loadMessages(chatId: string, before?: string): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Message[];
}

export const MESSAGES_PER_PAGE = PAGE;

export async function sendText(chatId: string, id: string, body: string) {
  const { error } = await supabase.from('messages').insert({ id, chat_id: chatId, kind: 'text', body });
  // Sent twice (a retry after a slow network): the first one arrived.
  if (error && error.code !== '23505') throw error;
}

export async function sendPhoto(
  chatId: string,
  id: string,
  photo: { bytes: ArrayBuffer | Uint8Array; mimeType: string; extension: string },
  caption: string | null,
) {
  const path = `${chatId}/${id}.${photo.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, photo.bytes, { contentType: photo.mimeType });
  // A retry after the upload got through but the answer was lost: the photo is already there.
  if (uploadError && !/exists|duplicate/i.test(uploadError.message)) throw uploadError;
  const { error } = await supabase
    .from('messages')
    .insert({ id, chat_id: chatId, kind: 'image', media_path: path, body: caption?.trim() || null });
  if (error && error.code !== '23505') {
    await supabase.storage
      .from(BUCKET)
      .remove([path])
      .catch(() => {});
    throw error;
  }
}

// Delete for everyone.
export async function deleteMessage(message: Pick<Message, 'id' | 'media_path'>) {
  const { error } = await supabase.from('messages').delete().eq('id', message.id);
  if (error) throw error;
  if (message.media_path) {
    await supabase.storage
      .from(BUCKET)
      .remove([message.media_path])
      .catch(() => {});
  }
}

export async function markRead(chatId: string) {
  const { error } = await supabase.rpc('mark_chat_read', { p_chat: chatId });
  if (error) throw error;
}

// Chat photos are private, so they are shown through links that work for an hour.
const signed = new Map<string, { url: string; expires: number }>();

export function cachedPhotoUrl(path: string) {
  const hit = signed.get(path);
  return hit && hit.expires > Date.now() ? hit.url : null;
}

export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = cachedPhotoUrl(path);
    if (hit) result[path] = hit;
    else missing.push(path);
  }
  if (missing.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(missing, 3600);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) {
        signed.set(item.path, { url: item.signedUrl, expires: Date.now() + 50 * 60_000 });
        result[item.path] = item.signedUrl;
      }
    }
  }
  return result;
}

// Removes the photos this person sent in their chats, before their account is deleted.
// A trainer's account takes its chats with it, so the trainer clears whole chats.
export async function removeMyChatPhotos() {
  const chats = await loadChats().catch(() => [] as ChatSummary[]);
  for (const chat of chats) {
    for (let round = 0; round < 20; round++) {
      const { data } = await supabase.storage.from(BUCKET).list(chat.chat_id, { limit: 1000 });
      const paths = (data ?? []).map((f) => `${chat.chat_id}/${f.name}`);
      if (!paths.length) break;
      const { data: removed, error } = await supabase.storage.from(BUCKET).remove(paths);
      // Only the person's own photos can be removed; stop when nothing more goes.
      if (error || !removed?.length) break;
    }
  }
}

// ---------- Words shown in the app ----------

export function callDuration(call: Pick<CallInfo, 'answered_at' | 'ended_at'>) {
  if (!call.answered_at || !call.ended_at) return null;
  const seconds = Math.max(0, Math.round((Date.parse(call.ended_at) - Date.parse(call.answered_at)) / 1000));
  return formatSeconds(seconds);
}

export function formatSeconds(total: number) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

// "Missed voice call", "Video call · 3:12", "No answer"...
export function callLabel(
  call: Pick<CallInfo, 'video' | 'status' | 'caller_id' | 'answered_at' | 'ended_at'>,
  myId: string,
) {
  const kind = call.video ? 'video call' : 'voice call';
  const Kind = call.video ? 'Video call' : 'Voice call';
  const mine = call.caller_id === myId;
  const length = callDuration(call);
  if (call.status === 'ended' && length) return `${Kind} · ${length}`;
  if (call.status === 'ended' || call.status === 'accepted') return Kind;
  if (call.status === 'ringing') return mine ? `Calling…` : `Incoming ${kind}`;
  if (mine) {
    if (call.status === 'declined') return `${Kind} declined`;
    if (call.status === 'busy') return `${Kind} · on another call`;
    if (call.status === 'cancelled') return `Cancelled ${kind}`;
    return `${Kind} · no answer`;
  }
  return `Missed ${kind}`;
}

export function isMissedCall(call: Pick<CallInfo, 'status' | 'caller_id'>, myId: string) {
  return call.caller_id !== myId && ['missed', 'cancelled', 'busy'].includes(call.status);
}

// One line for the chat list.
export function previewOf(chat: ChatSummary, myId: string) {
  if (!chat.last_kind) return 'Say hi 👋';
  if (chat.last_kind === 'call' && chat.last_call_status) {
    return callLabel(
      {
        video: !!chat.last_call_video,
        status: chat.last_call_status,
        caller_id: chat.last_sender_id ?? '',
        answered_at: chat.last_call_answered_at,
        ended_at: chat.last_call_ended_at,
      },
      myId,
    );
  }
  if (chat.last_kind === 'image') return chat.last_body ? `📷 ${chat.last_body}` : '📷 Photo';
  return chat.last_body ?? '';
}

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// "Today", "Yesterday", "Monday", or "3 Oct 2026".
export function dayLabel(iso: string, now = new Date()) {
  const day = new Date(iso);
  if (sameDay(day, now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(day, yesterday)) return 'Yesterday';
  const days = (now.getTime() - day.getTime()) / 86_400_000;
  if (days < 6) return day.toLocaleDateString([], { weekday: 'long' });
  return day.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

// For the chat list: the time today, "Yesterday", the weekday, or the date.
export function shortWhen(iso: string, now = new Date()) {
  const label = dayLabel(iso, now);
  if (label === 'Today') return timeOf(iso);
  if (label === 'Yesterday' || !/\d/.test(label)) return label;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
