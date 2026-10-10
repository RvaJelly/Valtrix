import { Ionicons } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Image } from 'expo-image';
import { router, Stack, useIsFocused, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { ReelCard } from '@/components/reel-card';
import { Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import {
  callLabel,
  dayLabel,
  deleteMessage,
  isMissedCall,
  loadMessages,
  markRead,
  MESSAGES_PER_PAGE,
  newId,
  photoUrls,
  sendPhoto,
  sendText,
  timeOf,
  type Message,
} from '@/lib/chat';
import { useChat, useChatEvents } from '@/lib/chat-live';
import { ChatPhotoError, pickChatPhoto, type ChatPhoto } from '@/lib/chat-photo';
import { confirm } from '@/lib/confirm';
import { authorName, type Reel } from '@/lib/posts';
import { isReelMessage, loadReelsByIds } from '@/lib/social';
import { supabase } from '@/lib/supabase';

type Row = { type: 'message'; message: Message } | { type: 'day'; key: string; label: string };

// Newest first, one copy of each message; a saved copy replaces the one shown while sending.
function merge(list: Message[], incoming: Message[]) {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const message of incoming) {
    const before = byId.get(message.id);
    byId.set(message.id, before ? { ...before, ...message, pending: undefined, local_uri: before.local_uri } : message);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

// A chat with one person: messages, photos, and buttons to call them.
export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string; name?: string; avatar?: string }>();
  const chatId = params.id;
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const { chats, live } = useChat();
  const summary = chats.find((c) => c.chat_id === chatId);
  const otherName = summary?.other_name ?? params.name ?? 'Chat';
  const otherAvatar = summary?.other_avatar ?? (params.avatar || null);
  const canCall = !!summary && summary.other_id !== me;
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  // Reels sent in this chat, by id; null when one can't be shown any more.
  const [reels, setReels] = useState<Record<string, Reel | null>>({});
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<ChatPhoto | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  // While the keyboard is up it covers the phone's bottom bar, so the message box needs no room for it.
  const [keyboardUp, setKeyboardUp] = useState(false);

  const typingChannel = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marking = useRef(false);
  // Photos that failed to send, kept so "try again" can send them.
  const unsentPhotos = useRef(new Map<string, ChatPhoto>());

  const loadLatest = useCallback(
    () =>
      loadMessages(chatId).then(
        (page) => {
          setMessages((current) => merge(current, page));
          setHasMore((more) => more || page.length === MESSAGES_PER_PAGE);
          setError(null);
          setLoading(false);
        },
        () => {
          setError('Could not load your messages. Check your internet and try again.');
          setLoading(false);
        },
      ),
    [chatId],
  );

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const shown = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hidden = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  async function loadOlder() {
    const oldest = messages.at(-1);
    if (!hasMore || loadingMore || !oldest || oldest.pending) return;
    setLoadingMore(true);
    try {
      const page = await loadMessages(chatId, oldest.created_at);
      setMessages((current) => merge(current, page));
      setHasMore(page.length === MESSAGES_PER_PAGE);
    } catch {
      // Scrolling up again tries again.
    }
    setLoadingMore(false);
  }

  // Live updates for this chat.
  useChatEvents((event) => {
    if (event.type === 'message' && event.message.chat_id === chatId) {
      setMessages((current) => merge(current, [event.message]));
    } else if (event.type === 'message_deleted' && event.chat_id === chatId) {
      setMessages((current) => current.filter((m) => m.id !== event.id));
    } else if (event.type === 'read' && event.chat_id === chatId && event.reader_id !== me) {
      const seen = Date.parse(event.read_at);
      setMessages((current) =>
        current.map((m) =>
          m.sender_id === me && !m.read_at && !m.pending && Date.parse(m.created_at) <= seen
            ? { ...m, read_at: event.read_at }
            : m,
        ),
      );
    } else if (event.type === 'reconnected') {
      loadLatest();
    }
  });

  // Without live updates (a weak connection), look for new messages every few seconds.
  const poll = useEffectEvent(() => loadLatest());
  useEffect(() => {
    if (live || !focused) return;
    const timer = setInterval(poll, 10_000);
    return () => clearInterval(timer);
  }, [live, focused]);

  // Messages from the other person count as read while this chat is open on screen.
  const unreadFromThem = messages.some((m) => m.sender_id !== me && !m.read_at && m.kind !== 'call');
  const markSeen = useEffectEvent(() => {
    if (marking.current) return;
    marking.current = true;
    const seenAt = new Date().toISOString();
    markRead(chatId).then(
      () => {
        marking.current = false;
        setMessages((current) =>
          current.map((m) => (m.sender_id !== me && !m.read_at ? { ...m, read_at: seenAt } : m)),
        );
      },
      () => {
        // Tried again with the next message.
        marking.current = false;
      },
    );
  });
  useEffect(() => {
    if (focused && active && (unreadFromThem || (summary?.unread ?? 0) > 0)) markSeen();
  }, [focused, active, unreadFromThem, summary?.unread]);

  // Private photo links for the photos on screen.
  const missingPhotos = useMemo(
    () => messages.filter((m) => m.media_path && !urls[m.media_path] && !m.pending).map((m) => m.media_path!),
    [messages, urls],
  );
  useEffect(() => {
    if (!missingPhotos.length) return;
    let stale = false;
    photoUrls(missingPhotos).then((found) => {
      if (!stale && Object.keys(found).length) setUrls((current) => ({ ...current, ...found }));
    });
    return () => {
      stale = true;
    };
  }, [missingPhotos]);

  // Who posted each reel sent here, and its caption, for the cards in the chat.
  const missingReels = useMemo(
    () => [...new Set(messages.filter((m) => m.post_id && !(m.post_id in reels)).map((m) => m.post_id!))],
    [messages, reels],
  );
  useEffect(() => {
    if (!missingReels.length) return;
    let stale = false;
    loadReelsByIds(missingReels).then(
      (found) => {
        if (stale) return;
        const next: Record<string, Reel | null> = {};
        for (const id of missingReels) next[id] = found.find((r) => r.id === id) ?? null;
        setReels((current) => ({ ...current, ...next }));
      },
      () => {
        // Shown as loading; the next change in the chat tries again.
      },
    );
    return () => {
      stale = true;
    };
  }, [missingReels]);

  // "typing…" in the header, shared on the chat's own private channel.
  const showTyping = useEffectEvent(() => {
    setTyping(true);
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 4000);
  });
  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let stopped = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (stopped) return;
      channel = supabase
        .channel(`chat:${chatId}`, { config: { private: true } })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.user_id !== me) showTyping();
        })
        .subscribe();
      typingChannel.current = channel;
    })();
    return () => {
      stopped = true;
      typingChannel.current = null;
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [chatId, me]);

  function onType(value: string) {
    setText(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > 2500 && typingChannel.current) {
      lastTypingSent.current = now;
      typingChannel.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: me } }).catch(() => {});
    }
  }

  async function deliver(message: Message, picked: ChatPhoto | null) {
    try {
      if (picked) await sendPhoto(chatId, message.id, picked, message.body);
      else await sendText(chatId, message.id, message.body ?? '');
      unsentPhotos.current.delete(message.id);
      setMessages((current) =>
        current.map((m) =>
          m.id === message.id && m.pending
            ? { ...m, pending: undefined, media_path: picked ? `${chatId}/${message.id}.${picked.extension}` : null }
            : m,
        ),
      );
      if (!live) loadLatest();
    } catch {
      if (picked) unsentPhotos.current.set(message.id, picked);
      setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, pending: 'failed' } : m)));
    }
  }

  // On a computer, Enter sends like WhatsApp Web and Shift+Enter starts a new line.
  function onKey(e: NativeSyntheticEvent<TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean }>) {
    const { key, shiftKey, isComposing } = e.nativeEvent;
    if (key !== 'Enter' || shiftKey || isComposing) return;
    e.preventDefault();
    send();
  }

  function send() {
    const body = text.trim();
    if ((!body && !photo) || !me) return;
    const message: Message = {
      id: newId(),
      chat_id: chatId,
      sender_id: me,
      kind: photo ? 'image' : 'text',
      body: body || null,
      media_path: null,
      call_id: null,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: 'sending',
      local_uri: photo?.uri,
    };
    setMessages((current) => merge(current, [message]));
    setText('');
    setPhoto(null);
    deliver(message, photo);
  }

  function retry(message: Message) {
    const picked = unsentPhotos.current.get(message.id) ?? null;
    if (message.kind === 'image' && !picked) {
      setMessages((current) => current.filter((m) => m.id !== message.id));
      return;
    }
    setMessages((current) => current.map((m) => (m.id === message.id ? { ...m, pending: 'sending' } : m)));
    deliver(message, picked);
  }

  async function remove(message: Message) {
    if (message.pending === 'failed') {
      unsentPhotos.current.delete(message.id);
      setMessages((current) => current.filter((m) => m.id !== message.id));
      return;
    }
    if (message.pending || message.sender_id !== me || message.kind === 'call') return;
    if (!(await confirm('Delete message?', `This deletes it for you and ${otherName}.`, 'Delete'))) return;
    try {
      await deleteMessage(message);
      setMessages((current) => current.filter((m) => m.id !== message.id));
    } catch {
      setError('Could not delete that message. Try again.');
    }
  }

  async function choosePhoto(from: 'camera' | 'library') {
    try {
      const picked = await pickChatPhoto(from);
      if (picked) setPhoto(picked);
    } catch (e) {
      setError(e instanceof ChatPhotoError ? e.message : 'Could not open that photo. Try another one.');
    }
  }

  function askPhoto() {
    if (Platform.OS === 'web') return choosePhoto('library');
    Alert.alert('Send a photo', undefined, [
      { text: 'Take a photo', onPress: () => choosePhoto('camera') },
      { text: 'Choose from your phone', onPress: () => choosePhoto('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function call(video: boolean) {
    router.push({
      pathname: '/call',
      params: { chat: chatId, video: video ? '1' : '0', name: otherName, avatar: otherAvatar ?? '' },
    });
  }

  function back() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  // Messages with a date above each day, for a list that starts at the bottom.
  const rows = useMemo(() => {
    const list: Row[] = [];
    messages.forEach((message, i) => {
      list.push({ type: 'message', message });
      const older = messages[i + 1];
      const day = dayLabel(message.created_at);
      if (!older || dayLabel(older.created_at) !== day)
        list.push({ type: 'day', key: `day-${message.id}`, label: day });
    });
    return list;
  }, [messages]);

  const canSend = !!text.trim() || !!photo;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable onPress={back} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={28} color={Colors.text} />
        </Pressable>
        <Avatar url={otherAvatar} name={otherName} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>
            {otherName}
          </Text>
          {typing ? <Text style={styles.typing}>typing…</Text> : null}
        </View>
        {canCall ? (
          <>
            <Pressable
              onPress={() => call(true)}
              hitSlop={8}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel={`Video call ${otherName}`}>
              <Ionicons name="videocam-outline" size={24} color={Colors.text} />
            </Pressable>
            <Pressable
              onPress={() => call(false)}
              hitSlop={8}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel={`Voice call ${otherName}`}>
              <Ionicons name="call-outline" size={22} color={Colors.text} />
            </Pressable>
          </>
        ) : null}
      </View>

      {/* 'padding' on Android too: the app draws edge to edge, so Android doesn't make the
          screen smaller for the keyboard, and the message box would sit behind it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
        {loading ? (
          <ActivityIndicator color={Colors.textSecondary} style={{ marginTop: Spacing.six }} />
        ) : (
          <FlatList
            inverted={messages.length > 0}
            data={rows}
            keyExtractor={(row) => (row.type === 'day' ? row.key : row.message.id)}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={Colors.textSecondary} /> : null}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Avatar url={otherAvatar} name={otherName} size={72} />
                <Text style={styles.emptyTitle}>Say hi to {otherName} 👋</Text>
                <Text style={styles.emptyText}>
                  Messages and calls here are just between the two of you.
                  {canCall ? ' Tap the phone or camera at the top to call.' : ''}
                </Text>
              </View>
            }
            renderItem={({ item }) =>
              item.type === 'day' ? (
                <View style={styles.dayRow}>
                  <Text style={styles.day}>{item.label}</Text>
                </View>
              ) : item.message.kind === 'call' && item.message.call ? (
                <CallRow message={item.message} me={me} onCall={canCall ? call : undefined} />
              ) : (
                <Bubble
                  message={item.message}
                  mine={item.message.sender_id === me}
                  url={item.message.media_path ? urls[item.message.media_path] : undefined}
                  reel={item.message.post_id ? reels[item.message.post_id] : null}
                  onPress={(url) => {
                    if (item.message.pending === 'failed') retry(item.message);
                    else if (url) setViewing(url);
                    else if (item.message.post_id && reels[item.message.post_id])
                      router.push({ pathname: '/reel/[id]', params: { id: item.message.post_id } });
                  }}
                  onLongPress={() => remove(item.message)}
                />
              )
            }
          />
        )}

        {error ? (
          <Pressable onPress={() => setError(null)} style={styles.errorBar} accessibilityRole="button">
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : null}

        <View
          style={[styles.composer, { paddingBottom: keyboardUp ? Spacing.two : Math.max(insets.bottom, Spacing.two) }]}>
          {photo ? (
            <View style={styles.photoReady}>
              <Image source={{ uri: photo.uri }} style={styles.photoThumb} contentFit="cover" />
              <Text style={styles.photoReadyText}>Photo ready. Add a caption or tap send.</Text>
              <Pressable onPress={() => setPhoto(null)} hitSlop={8} accessibilityLabel="Remove photo">
                <Ionicons name="close-circle" size={24} color={Colors.textSecondary} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.inputRow}>
            <Pressable onPress={askPhoto} hitSlop={6} style={styles.attach} accessibilityLabel="Send a photo">
              <Ionicons name="image-outline" size={26} color={Colors.textSecondary} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={onType}
              placeholder={photo ? 'Add a caption' : 'Message'}
              placeholderTextColor={Colors.textSecondary}
              multiline
              maxLength={4000}
              style={styles.input}
              accessibilityLabel="Message"
              onKeyPress={Platform.OS === 'web' ? onKey : undefined}
            />
            {/* Orange only once there is something to send. */}
            <Pressable
              onPress={send}
              disabled={!canSend}
              hitSlop={4}
              style={[styles.send, { backgroundColor: canSend ? Colors.accent : Colors.tint }]}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}>
              <Ionicons name="arrow-up" size={20} color={canSend ? Colors.onAccent : Colors.textTertiary} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          {viewing ? (
            <Image source={{ uri: viewing }} style={{ flex: 1 }} contentFit="contain" accessibilityLabel="Photo" />
          ) : null}
          <Pressable
            onPress={() => setViewing(null)}
            style={[styles.viewerClose, { top: insets.top + Spacing.three }]}
            accessibilityRole="button"
            accessibilityLabel="Close photo">
            <Ionicons name="close" size={30} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function Bubble({
  message,
  mine,
  url,
  reel,
  onPress,
  onLongPress,
}: {
  message: Message;
  mine: boolean;
  url?: string;
  // For a reel sent in the chat: undefined while it loads, null when it is gone.
  reel?: Reel | null;
  onPress: (url: string | undefined) => void;
  onLongPress: () => void;
}) {
  const photo = message.kind === 'image' ? (url ?? message.local_uri) : undefined;
  const sharedReel = isReelMessage(message);
  const said = sharedReel
    ? `shared a reel${reel ? ` by ${authorName(reel)}` : reel === null ? ' that is no longer available' : ''}`
    : `said ${message.kind === 'image' ? 'a photo' : ''} ${message.body ?? ''}`;
  const status =
    message.pending === 'sending'
      ? 'Sending'
      : message.pending === 'failed'
        ? 'Not sent'
        : message.read_at
          ? 'Read'
          : 'Sent';
  return (
    <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable
        onPress={() => onPress(photo)}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={[
          styles.bubble,
          mine ? styles.mine : styles.theirs,
          photo || (sharedReel && reel !== null) ? styles.photoBubble : null,
        ]}
        accessibilityLabel={`${mine ? 'You' : 'They'} ${said}, ${timeOf(message.created_at)}${mine ? `, ${status}` : ''}`}>
        {message.kind === 'image' ? (
          photo ? (
            <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.photo, styles.photoLoading]}>
              <ActivityIndicator color={mine ? Colors.onBubble : Colors.textSecondary} />
            </View>
          )
        ) : null}
        {sharedReel ? <ReelCard reel={message.post_id ? reel : null} mine={mine} /> : null}
        {message.body && !sharedReel ? (
          <Text style={[styles.body, mine && styles.bodyMine, photo ? { paddingHorizontal: Spacing.one } : null]}>
            {message.body}
          </Text>
        ) : null}
        <View style={[styles.meta, photo || (sharedReel && reel !== null) ? { paddingHorizontal: Spacing.one } : null]}>
          <Text style={[styles.time, mine && styles.timeMine]}>{timeOf(message.created_at)}</Text>
          {mine ? (
            <Ionicons
              name={
                message.pending === 'sending'
                  ? 'time-outline'
                  : message.pending === 'failed'
                    ? 'alert-circle'
                    : message.read_at
                      ? 'checkmark-done'
                      : 'checkmark'
              }
              size={15}
              color={Colors.onBubble}
              style={{ opacity: message.read_at || message.pending === 'failed' ? 1 : 0.72 }}
            />
          ) : null}
        </View>
      </Pressable>
      {message.pending === 'failed' ? <Text style={styles.failed}>Not sent. Tap to try again.</Text> : null}
    </View>
  );
}

function CallRow({ message, me, onCall }: { message: Message; me: string; onCall?: (video: boolean) => void }) {
  const call = message.call!;
  const missed = isMissedCall(call, me);
  const label = callLabel(call, me);
  return (
    <View style={styles.callRow}>
      <Pressable
        onPress={onCall ? () => onCall(call.video) : undefined}
        style={styles.callPill}
        accessibilityRole={onCall ? 'button' : undefined}
        accessibilityLabel={`${label}, ${timeOf(message.created_at)}${onCall ? '. Tap to call back.' : ''}`}>
        <Ionicons
          name={call.video ? 'videocam-outline' : 'call-outline'}
          size={16}
          color={missed ? Colors.danger : Colors.textSecondary}
        />
        <Text style={[styles.callText, missed && { color: Colors.danger }]}>{label}</Text>
        <Text style={styles.callTime}>{timeOf(message.created_at)}</Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  headerName: {
    ...Type.headline,
    color: Colors.text,
  },
  typing: {
    ...Type.footnote,
    color: Colors.textSecondary,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.one,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
  },
  emptyTitle: {
    ...Type.headline,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  emptyText: {
    ...Type.callout,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  dayRow: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  day: {
    ...Type.footnote,
    fontFamily: Fonts.textMedium,
    color: Colors.textSecondary,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.large,
    overflow: 'hidden',
  },
  bubbleRow: {
    maxWidth: '78%',
    marginVertical: 2,
  },
  rowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
    borderRadius: 18,
  },
  mine: {
    backgroundColor: Colors.bubble,
    borderBottomRightRadius: 6,
  },
  theirs: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 6,
  },
  photoBubble: {
    padding: 4,
  },
  photo: {
    width: 220,
    height: 260,
    borderRadius: 14,
  },
  photoLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceRaised,
  },
  body: {
    ...Type.body,
    lineHeight: 22,
    color: Colors.text,
    paddingTop: 2,
  },
  bodyMine: {
    color: Colors.onBubble,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 2,
  },
  time: {
    ...Tabular,
    fontFamily: Fonts.text,
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  // Fully opaque, so the time stays readable on the bubble.
  timeMine: {
    color: 'rgba(255,255,255,0.72)',
  },
  failed: {
    ...Type.footnote,
    color: Colors.danger,
    marginTop: 2,
  },
  callRow: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  callPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.large,
    backgroundColor: Colors.surface,
  },
  callText: {
    ...Type.footnote,
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
  callTime: {
    ...Type.footnote,
    ...Tabular,
    color: Colors.textSecondary,
  },
  errorBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.two,
  },
  errorText: {
    ...Type.callout,
    color: Colors.danger,
  },
  composer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    gap: Spacing.two,
    backgroundColor: Colors.background,
  },
  photoReady: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  photoThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  photoReadyText: {
    ...Type.footnote,
    flex: 1,
    color: Colors.textSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  attach: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: Spacing.three,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 22,
    backgroundColor: Colors.tint,
    color: Colors.text,
    ...Type.body,
    lineHeight: 22,
  },
  send: {
    width: 36,
    height: 36,
    marginVertical: 4,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerClose: {
    position: 'absolute',
    right: Spacing.three,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
