import type { CallInfo } from '@/lib/chat';
import { supabase } from '@/lib/supabase';

// Voice and video calls between a trainer and their client. The database keeps
// each call's state (ringing, answered, ended...) and tells both phones about every
// change; the two phones then connect to each other directly over WebRTC.

export type Call = CallInfo & {
  chat_id: string;
  callee_id: string;
  created_at: string;
  // Whether the person being called is the trainer or the client in that chat.
  callee_role: 'trainer' | 'client';
  caller_name: string;
  caller_avatar: string | null;
  callee_name: string;
  callee_avatar: string | null;
};

export type CallAction = 'accept' | 'decline' | 'cancel' | 'missed' | 'end';

// Public servers that help two phones find each other. Some mobile networks also
// need a relay (TURN) server; add one here before launch.
export const ICE_SERVERS = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

// How long a call rings before it counts as missed.
export const RING_SECONDS = 45;

const known = new Map<string, Call>();

export function rememberCall(call: Call) {
  const before = known.get(call.id);
  // Names come with every update from the database; keep the latest state.
  known.set(call.id, { ...before, ...call });
}

export function knownCall(id: string) {
  return known.get(id) ?? null;
}

export async function startCall(chatId: string, video: boolean): Promise<Call> {
  const { data, error } = await supabase.rpc('start_call', { p_chat: chatId, p_video: video });
  if (error) throw error;
  const call = data as Call;
  rememberCall(call);
  return call;
}

export async function updateCall(id: string, action: CallAction): Promise<Call> {
  const { data, error } = await supabase.rpc('update_call', { p_call: id, p_action: action });
  if (error) throw error;
  const call = data as Call;
  rememberCall(call);
  return call;
}

const CALL_COLUMNS = 'id, chat_id, caller_id, callee_id, video, status, created_at, answered_at, ended_at';
export type CallRow = Omit<Call, 'callee_role' | 'caller_name' | 'caller_avatar' | 'callee_name' | 'callee_avatar'>;

// Calls ringing for this person right now, for when the app opens while someone is calling.
export async function ringingCalls(myId: string): Promise<CallRow[]> {
  const since = new Date(Date.now() - RING_SECONDS * 1000).toISOString();
  const { data } = await supabase
    .from('calls')
    .select(CALL_COLUMNS)
    .eq('callee_id', myId)
    .eq('status', 'ringing')
    .gt('created_at', since);
  return (data ?? []) as CallRow[];
}

export async function fetchCall(id: string): Promise<CallRow | null> {
  const { data } = await supabase.from('calls').select(CALL_COLUMNS).eq('id', id).maybeSingle();
  return (data as CallRow | null) ?? null;
}

// The call this phone is on, so a second call doesn't open on top of it.
let current: string | null = null;

export function setCurrentCall(id: string | null) {
  current = id;
}

export function currentCall() {
  return current;
}

export function isOver(status: Call['status']) {
  return !['ringing', 'accepted'].includes(status);
}
