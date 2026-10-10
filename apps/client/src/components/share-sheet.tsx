import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Text } from '@/components/ui';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import type { ChatSummary } from '@/lib/chat';
import { useChat } from '@/lib/chat-live';
import { mediaUrl, type Reel } from '@/lib/posts';
import { canShareLink, CopyFailedError, shareReelToApps } from '@/lib/share-reel';
import { sendReelInChat } from '@/lib/social';

type SendState = 'sending' | 'sent' | 'failed';
// link: shown so it can be copied by hand. Browsers don't always say when copying didn't work.
type Status = { kind: 'busy' | 'done' | 'error'; text: string; link?: string };

// Share a reel: send it to someone you chat with, or to other apps like WhatsApp.
export function ShareSheet({ reel, onClose }: { reel: Reel | null; onClose: () => void }) {
  const { chats, ready, refresh } = useChat();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [sent, setSent] = useState<Record<string, SendState>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [chatsFailed, setChatsFailed] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // Counts share attempts; closing the sheet bumps it so a video still downloading isn't shared.
  const shareAttempt = useRef(0);
  const open = !!reel;

  // Start fresh each time the sheet opens for a reel.
  if ((reel?.id ?? null) !== shownFor) {
    setShownFor(reel?.id ?? null);
    setSent({});
    setStatus(null);
    setChatsFailed(false);
  }

  // The chat list may never have loaded (for example the phone was offline when the app
  // opened). Try again now, and say so if it still can't.
  useEffect(() => {
    if (!open || ready) return;
    let stale = false;
    refresh().then((list) => {
      if (!stale && !list) setChatsFailed(true);
    });
    return () => {
      stale = true;
    };
  }, [open, ready, refresh]);

  function retryChats() {
    setChatsFailed(false);
    refresh().then((list) => {
      if (!list) setChatsFailed(true);
    });
  }

  function close() {
    shareAttempt.current += 1;
    onClose();
  }

  async function send(chat: ChatSummary) {
    if (!reel) return;
    setSent((s) => ({ ...s, [chat.chat_id]: 'sending' }));
    try {
      await sendReelInChat(chat.chat_id, reel.id);
      setSent((s) => ({ ...s, [chat.chat_id]: 'sent' }));
    } catch (e) {
      setSent((s) => ({ ...s, [chat.chat_id]: 'failed' }));
      const blocked = e instanceof Error && /can.t be shared/i.test(e.message);
      setStatus({
        kind: 'error',
        text: blocked ? "This reel can't be shared." : "Couldn't send it. Check your internet and try again.",
      });
    }
  }

  async function shareOut() {
    if (!reel || status?.kind === 'busy') return;
    shareAttempt.current += 1;
    const attempt = shareAttempt.current;
    const stillWanted = () => shareAttempt.current === attempt;
    setStatus({ kind: 'busy', text: Platform.OS === 'web' ? 'Opening…' : 'Getting the video ready…' });
    try {
      const result = await shareReelToApps(reel, stillWanted);
      if (!stillWanted()) return;
      setStatus(result === 'copied' ? { kind: 'done', text: 'Link copied', link: mediaUrl(reel.media_path) } : null);
    } catch (e) {
      if (!stillWanted()) return;
      setStatus(
        e instanceof CopyFailedError
          ? { kind: 'error', text: "Couldn't copy the link. You can copy it from here:", link: e.url }
          : { kind: 'error', text: "Couldn't share the video. Check your internet and try again." },
      );
    }
  }

  const linkOnly = !canShareLink();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        <View style={styles.handle} />
        <Text style={styles.title} accessibilityRole="header">
          Share reel
        </Text>

        <Text style={styles.section}>Send in chat</Text>
        {!ready && chatsFailed ? (
          <View style={styles.failed}>
            <Text style={[styles.note, { flex: 1 }]}>Couldn&apos;t load your chats.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={retryChats}
              hitSlop={6}
              style={({ pressed }) => [styles.retry, pressed && { backgroundColor: Colors.surfaceRaised }]}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : !ready ? (
          <ActivityIndicator color={Colors.textSecondary} style={{ marginVertical: Spacing.three }} />
        ) : chats.length ? (
          <ScrollView style={{ maxHeight: height * 0.4 }}>
            {chats.map((chat) => (
              <ChatRow key={chat.chat_id} chat={chat} state={sent[chat.chat_id]} onSend={() => send(chat)} />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.note}>No chats yet. When you have one, you can send reels there.</Text>
        )}

        <View style={styles.divider} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={linkOnly ? 'Copy link' : 'Share to other apps'}
          onPress={shareOut}
          disabled={status?.kind === 'busy'}
          style={({ pressed }) => [styles.option, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <View style={styles.optionIcon}>
            <Ionicons name={linkOnly ? 'link-outline' : 'share-social-outline'} size={22} color={Colors.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionText}>{linkOnly ? 'Copy link' : 'Share to other apps'}</Text>
            <Text style={styles.detail}>{linkOnly ? 'Paste it in any app' : 'WhatsApp, Instagram and more'}</Text>
          </View>
        </Pressable>

        {status ? (
          <View style={styles.status} accessibilityLiveRegion="polite">
            {status.kind === 'busy' ? <ActivityIndicator color={Colors.textSecondary} /> : null}
            {status.kind === 'done' ? <Ionicons name="checkmark-circle" size={20} color={Colors.accentText} /> : null}
            <Text style={[styles.statusText, status.kind === 'error' && { color: Colors.danger }]}>{status.text}</Text>
          </View>
        ) : null}
        {status?.link ? (
          <Text selectable style={styles.link} accessibilityLabel={`Reel link: ${status.link}`}>
            {status.link}
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [styles.done, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function ChatRow({ chat, state, onSend }: { chat: ChatSummary; state?: SendState; onSend: () => void }) {
  const done = state === 'sent';
  return (
    <View style={styles.row}>
      <Avatar url={chat.other_avatar} name={chat.other_name} size={44} />
      <Text style={styles.name} numberOfLines={1}>
        {chat.other_name}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={done ? `Sent to ${chat.other_name}` : `Send to ${chat.other_name}`}
        onPress={onSend}
        disabled={state === 'sending' || done}
        hitSlop={6}
        style={({ pressed }) => [
          styles.sendButton,
          done ? styles.sentButton : { backgroundColor: pressed ? Colors.accentPressed : Colors.accent },
        ]}>
        {state === 'sending' ? (
          <ActivityIndicator color={Colors.onAccent} />
        ) : (
          <Text style={[styles.sendText, done && { color: Colors.text }]}>
            {done ? 'Sent' : state === 'failed' ? 'Try again' : 'Send'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = themed(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    gap: Spacing.one,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderTopLeftRadius: Radius.large,
    borderTopRightRadius: Radius.large,
    backgroundColor: Colors.background,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    marginBottom: Spacing.two,
    backgroundColor: Colors.border,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  section: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.two,
    marginBottom: Spacing.one,
  },
  note: {
    color: Colors.textSecondary,
    fontSize: 15,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  failed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  retry: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  retryText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  link: {
    color: Colors.text,
    fontSize: 13,
    marginHorizontal: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.small,
    backgroundColor: Colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    paddingHorizontal: Spacing.two,
  },
  name: {
    flex: 1,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  sendButton: {
    minWidth: 92,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentButton: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sendText: {
    color: Colors.onAccent,
    fontSize: 15,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.two,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  optionText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  detail: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  statusText: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  done: {
    minHeight: 52,
    marginTop: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  doneText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
}));
