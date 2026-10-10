import type { RealtimeChannel } from '@supabase/supabase-js';
import { router } from 'expo-router';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { useAppLocked } from '@/components/app-lock';
import { useAuth } from '@/lib/auth';
import { CHAT_ROLE } from '@/lib/chat-role';
import { loadChats, type ChatSummary, type Message } from '@/lib/chat';
import { currentCall, fetchCall, isOver, rememberCall, RING_SECONDS, ringingCalls, type Call } from '@/lib/calls';
import { playTone, stopTone } from '@/lib/ring';
import { supabase } from '@/lib/supabase';

// Keeps the chat list and unread count up to date while the app is open, and
// opens the incoming call screen when someone calls. Everything arrives on the
// person's private inbox channel, which only the database can send to. 'link'
// news says a trainer invite was sent, answered or withdrawn, or a link started
// or ended, so screens showing invites and clients can load again. 'progress' news
// says a trainer replied to a check-in (kind 'reply'), so the check-in screen and
// Home can show it. 'session' news says a trainer booked, moved, cancelled or marked
// one of the person's sessions, and 'plan' news that their plan changed, so Home and
// the Plan tab can load again.

export type ChatEvent =
  | { type: 'message'; message: Message }
  | { type: 'message_deleted'; id: string; chat_id: string }
  | { type: 'read'; chat_id: string; reader_id: string; read_at: string }
  | { type: 'call'; call: Call }
  | { type: 'link'; client_id: string; invite_status: string }
  | { type: 'progress'; client_id: string | null; kind: ProgressKind; check_in_id: string | null }
  | { type: 'session'; client_id: string }
  | { type: 'plan'; client_id: string }
  | { type: 'reconnected' };

export type ProgressKind = 'workout' | 'weight' | 'measurements' | 'photo' | 'check_in' | 'reply';

type ChatState = {
  chats: ChatSummary[];
  // False until the chat list has loaded once.
  ready: boolean;
  // True while live updates are coming in. Screens check for new messages themselves when not.
  live: boolean;
  unread: number;
  refresh: () => Promise<ChatSummary[] | null>;
  listen: (listener: (event: ChatEvent) => void) => () => void;
};

const ChatContext = createContext<ChatState | null>(null);

export function ChatProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState(false);
  const listeners = useRef(new Set<(event: ChatEvent) => void>());
  // Calls this phone already rang for, so one call never opens two screens.
  const rang = useRef(new Set<string>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useAppLocked();
  // Calls that came in while the Face ID or fingerprint lock showed, each with a timer for
  // when it would have rung out. They ring, and once the app is unlocked the call screen
  // opens for one that is still ringing.
  const waiting = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const wasLocked = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(
    () =>
      loadChats().then(
        (list) => {
          setChats(list);
          setReady(true);
          return list;
        },
        // Keep what is on screen; the next update or pull-to-refresh tries again.
        () => null,
      ),
    [],
  );

  const listen = useCallback((listener: (event: ChatEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const emit = useEffectEvent((event: ChatEvent) => {
    for (const listener of listeners.current) listener(event);
  });

  // Many messages can arrive at once (for example after a call); reload the list once.
  const refreshSoon = useEffectEvent(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      refresh();
    }, 250);
  });

  // Stops waiting for one call, or for all of them. The ringtone stops with the last one.
  const stopWaiting = useEffectEvent((id?: string) => {
    const ids = id ? [id] : [...waiting.current.keys()];
    if (!ids.some((each) => waiting.current.has(each))) return;
    for (const each of ids) {
      clearTimeout(waiting.current.get(each));
      waiting.current.delete(each);
    }
    if (!waiting.current.size) stopTone();
  });

  const ring = useEffectEvent((call: Pick<Call, 'id'>) => {
    // On an iPhone the call screen would open on top of the lock screen, and the call
    // could be answered without unlocking. So only the ringtone plays until then.
    if (locked) {
      if (rang.current.has(call.id) || currentCall() || waiting.current.has(call.id)) return;
      if (!waiting.current.size) playTone('incoming');
      waiting.current.set(
        call.id,
        setTimeout(() => stopWaiting(call.id), (RING_SECONDS + 10) * 1000),
      );
      return;
    }
    // The call screen does the ringing from here.
    stopWaiting();
    if (rang.current.has(call.id) || currentCall()) return;
    rang.current.add(call.id);
    router.push({ pathname: '/call', params: { id: call.id, incoming: '1' } });
  });

  const onCall = useEffectEvent((call: Call) => {
    rememberCall(call);
    emit({ type: 'call', call });
    if (call.status !== 'ringing') stopWaiting(call.id);
    // Only ring in the app for this side of the chat: a trainer who also uses
    // the client app hears calls from their clients in Voltrix Coach.
    if (call.status === 'ringing' && call.callee_id === userId && call.callee_role === CHAT_ROLE) ring(call);
    if (call.status !== 'ringing' && call.status !== 'accepted') refreshSoon();
  });

  // Someone may have called while the app was closed, offline or locked. False when the
  // calls couldn't be checked.
  const checkRinging = useEffectEvent(async (list: ChatSummary[] | null) => {
    if (!userId) return true;
    if (!list) return false;
    const calls = await ringingCalls(userId).catch(() => null);
    if (!calls) return false;
    const mine = new Set(list.map((c) => c.chat_id));
    for (const call of calls) {
      if (mine.has(call.chat_id)) ring(call);
    }
    return true;
  });

  const onConnected = useEffectEvent(async () => {
    setLive(true);
    const list = await refresh();
    emit({ type: 'reconnected' });
    checkRinging(list);
  });

  useEffect(() => {
    if (!userId) return;
    let channel: RealtimeChannel | null = null;
    let stopped = false;
    (async () => {
      // Private channels check who is listening with the person's sign-in.
      await supabase.realtime.setAuth();
      if (stopped) return;
      channel = supabase
        .channel(`inbox:${userId}`, { config: { private: true } })
        .on('broadcast', { event: 'message' }, ({ payload }) => {
          emit({ type: 'message', message: payload as Message });
          refreshSoon();
        })
        .on('broadcast', { event: 'message_deleted' }, ({ payload }) => {
          emit({ type: 'message_deleted', id: payload.id, chat_id: payload.chat_id });
          refreshSoon();
        })
        .on('broadcast', { event: 'read' }, ({ payload }) => {
          emit({ type: 'read', chat_id: payload.chat_id, reader_id: payload.reader_id, read_at: payload.read_at });
          refreshSoon();
        })
        .on('broadcast', { event: 'call' }, ({ payload }) => onCall(payload as Call))
        .on('broadcast', { event: 'link' }, ({ payload }) => {
          emit({ type: 'link', client_id: payload.client_id, invite_status: payload.invite_status });
          refreshSoon();
        })
        .on('broadcast', { event: 'session' }, ({ payload }) => {
          emit({ type: 'session', client_id: payload.client_id });
        })
        .on('broadcast', { event: 'plan' }, ({ payload }) => {
          emit({ type: 'plan', client_id: payload.client_id });
        })
        .on('broadcast', { event: 'progress' }, ({ payload }) => {
          emit({
            type: 'progress',
            client_id: payload.client_id ?? null,
            kind: payload.kind,
            check_in_id: payload.check_in_id ?? null,
          });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onConnected();
          else setLive(false);
        });
    })();
    return () => {
      stopped = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh().then((list) => checkRinging(list));
    });
    return () => sub.remove();
  }, [userId, refresh]);

  // Unlocked: open the call screen for the newest call that rang meanwhile, unless it has
  // ended since. If that can't be checked, the call screen opens anyway and checks itself.
  // Then look for any other call ringing now (live updates may have been down), and try
  // once more if that fails.
  const onUnlocked = useEffectEvent(async () => {
    if (!userId) return stopWaiting();
    for (const id of [...waiting.current.keys()].reverse()) {
      const call = await fetchCall(id).catch(() => null);
      // Stopped waiting meanwhile: it ended, or a call screen opened.
      if (!waiting.current.has(id)) continue;
      if (call && isOver(call.status)) stopWaiting(id);
      else {
        ring({ id });
        break;
      }
    }
    const check = () => refresh().then((list) => checkRinging(list));
    if (await check()) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      check();
    }, 3000);
  });

  useEffect(() => {
    if (locked) wasLocked.current = true;
    else if (wasLocked.current) {
      wasLocked.current = false;
      onUnlocked();
    }
  }, [locked]);

  // Signing out from the lock screen stops the ringing too.
  const onLeave = useEffectEvent(() => {
    stopWaiting();
    if (retryTimer.current) clearTimeout(retryTimer.current);
  });
  useEffect(() => () => onLeave(), []);

  const unread = chats.reduce((sum, c) => sum + c.unread, 0);
  const value = useMemo(
    () => ({ chats, ready, live, unread, refresh, listen }),
    [chats, ready, live, unread, refresh, listen],
  );
  return <ChatContext value={value}>{children}</ChatContext>;
}

export function useChat() {
  const value = use(ChatContext);
  if (!value) throw new Error('useChat must be used inside ChatProvider');
  return value;
}

// Runs the handler for every chat event while the screen is open.
export function useChatEvents(handler: (event: ChatEvent) => void) {
  const { listen } = useChat();
  const onEvent = useEffectEvent(handler);
  useEffect(() => listen((event) => onEvent(event)), [listen]);
}
