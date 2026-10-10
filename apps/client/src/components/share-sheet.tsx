import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Sheet } from '@/components/sheet';
import { Button, EmptyState, Group, IconTile, ListRow, Notice, Section, SkeletonRows, Text } from '@/components/ui';
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
  const [sent, setSent] = useState<Record<string, SendState>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [chatsFailed, setChatsFailed] = useState(false);
  const [shownFor, setShownFor] = useState<string | null>(null);
  // Counts share attempts; closing the sheet bumps it so a video still downloading isn't shared.
  const shareAttempt = useRef(0);
  const open = !!reel;

  // Start fresh each time the sheet opens for a reel. (Closing keeps what was shown, so the sheet
  // doesn't change while it slides away.)
  if (reel && reel.id !== shownFor) {
    setShownFor(reel.id);
    setSent({});
    setStatus(null);
    setChatsFailed(false);
  }
  if (!reel && shownFor !== null) setShownFor(null);

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
  const outLabel = linkOnly ? 'Copy link' : 'Share to other apps';

  return (
    <Sheet visible={open} onClose={close} title="Share reel">
      <Section title="Send in chat">
        {!ready && chatsFailed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retryChats }}>
            Couldn&apos;t load your chats.
          </Notice>
        ) : !ready ? (
          <SkeletonRows count={2} avatar />
        ) : chats.length ? (
          <Group>
            {chats.map((chat, i) => (
              <ChatRow
                key={chat.chat_id}
                chat={chat}
                state={sent[chat.chat_id]}
                onSend={() => send(chat)}
                last={i === chats.length - 1}
              />
            ))}
          </Group>
        ) : (
          <EmptyState
            compact
            icon="chatbubbles-outline"
            title="No chats yet"
            message="When you have one, you can send reels there."
          />
        )}
      </Section>

      <Group>
        <ListRow
          title={outLabel}
          subtitle={linkOnly ? 'Paste it in any app' : 'WhatsApp, Instagram and more'}
          leading={<IconTile icon={linkOnly ? 'link-outline' : 'share-social-outline'} />}
          chevron={false}
          accessibilityLabel={outLabel}
          onPress={shareOut}
          last
        />
      </Group>

      {status ? (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Ionicons
            name={
              status.kind === 'busy' ? 'time-outline' : status.kind === 'done' ? 'checkmark-circle' : 'alert-circle'
            }
            size={18}
            color={
              status.kind === 'busy' ? Colors.textSecondary : status.kind === 'done' ? Colors.success : Colors.danger
            }
          />
          <Text variant="callout" tone={status.kind === 'error' ? 'danger' : 'primary'} style={{ flex: 1 }}>
            {status.text}
          </Text>
        </View>
      ) : null}
      {status?.link ? (
        <Text variant="footnote" selectable style={styles.link} accessibilityLabel={`Reel link: ${status.link}`}>
          {status.link}
        </Text>
      ) : null}

      <Button title="Done" variant="secondary" onPress={close} />
    </Sheet>
  );
}

function ChatRow({
  chat,
  state,
  onSend,
  last,
}: {
  chat: ChatSummary;
  state?: SendState;
  onSend: () => void;
  last: boolean;
}) {
  const done = state === 'sent';
  return (
    <ListRow
      title={chat.other_name}
      leading={<Avatar url={chat.other_avatar} name={chat.other_name} size={40} />}
      trailing={
        <Button
          title={done ? 'Sent' : state === 'failed' ? 'Try again' : 'Send'}
          icon={done ? 'checkmark' : undefined}
          variant={done ? 'ghost' : 'secondary'}
          size="medium"
          accessibilityLabel={done ? `Sent to ${chat.other_name}` : `Send to ${chat.other_name}`}
          onPress={onSend}
          loading={state === 'sending'}
          disabled={done}
          style={{ minWidth: 92 }}
        />
      }
      compact
      last={last}
    />
  );
}

const styles = themed(() => ({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  link: {
    padding: Spacing.tight,
    borderRadius: Radius.small,
    backgroundColor: Colors.tint,
  },
}));
