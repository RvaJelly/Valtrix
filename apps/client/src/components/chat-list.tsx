import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button, EmptyState } from '@/components/ui';
import { Colors, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { previewOf, shortWhen, type ChatSummary } from '@/lib/chat';
import { useChat } from '@/lib/chat-live';

// Everyone this person can chat with, newest conversation first, like WhatsApp's Chats tab.
export function ChatList({ empty }: { empty: { title: string; message: string; action?: ReactNode } }) {
  const { chats, ready, refresh } = useChat();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    const list = await refresh();
    setFailed(!list);
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function pull() {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }

  if (!ready) {
    return failed ? (
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="cloud-offline-outline"
          title="Chats could not be loaded"
          message="Check your internet connection and try again."
          action={<Button title="Try again" variant="secondary" onPress={pull} loading={refreshing} />}
        />
      </ScrollView>
    ) : (
      <ActivityIndicator color={Colors.accentText} style={{ marginTop: Spacing.six }} />
    );
  }

  return (
    <FlatList
      data={chats}
      keyExtractor={(chat) => chat.chat_id}
      contentContainerStyle={{ flexGrow: 1, paddingVertical: Spacing.two }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={Colors.accentText} />}
      ListEmptyComponent={
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState icon="chatbubbles-outline" title={empty.title} message={empty.message} action={empty.action} />
        </View>
      }
      renderItem={({ item }) => <ChatRow chat={item} me={me} />}
    />
  );
}

function ChatRow({ chat, me }: { chat: ChatSummary; me: string }) {
  const mine = chat.last_sender_id === me && chat.last_kind !== 'call';
  const missed =
    chat.last_kind === 'call' &&
    chat.last_sender_id !== me &&
    ['missed', 'cancelled', 'busy'].includes(chat.last_call_status ?? '');
  const preview = previewOf(chat, me);
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/chat/[id]',
          params: { id: chat.chat_id, name: chat.other_name, avatar: chat.other_avatar ?? '' },
        })
      }
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: Colors.surface }]}
      accessibilityRole="button"
      accessibilityLabel={`${chat.other_name}. ${preview}${chat.unread ? `. ${chat.unread} unread` : ''}`}>
      <Avatar url={chat.other_avatar} name={chat.other_name} size={54} />
      <View style={styles.middle}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>
            {chat.other_name}
          </Text>
          {chat.last_at ? (
            <Text style={[styles.when, chat.unread ? { color: Colors.accentText, fontWeight: '700' } : null]}>
              {shortWhen(chat.last_at)}
            </Text>
          ) : null}
        </View>
        <View style={styles.line}>
          {mine ? (
            <Ionicons
              name={chat.last_read_at ? 'checkmark-done' : 'checkmark'}
              size={16}
              color={chat.last_read_at ? Colors.accentText : Colors.textSecondary}
            />
          ) : null}
          {chat.last_kind === 'call' ? (
            <Ionicons
              name={chat.last_call_video ? 'videocam' : 'call'}
              size={14}
              color={missed ? Colors.danger : Colors.textSecondary}
            />
          ) : null}
          <Text
            style={[styles.preview, missed && { color: Colors.danger }, chat.unread ? { color: Colors.text } : null]}
            numberOfLines={1}>
            {preview}
          </Text>
          {chat.unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{chat.unread > 99 ? '99+' : chat.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  middle: {
    flex: 1,
    gap: 3,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    flex: 1,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  when: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  preview: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 15,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  badgeText: {
    color: Colors.onAccent,
    fontSize: 12,
    fontWeight: '800',
  },
}));
