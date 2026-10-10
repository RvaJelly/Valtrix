import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button, EmptyState, groupedItem, PageHeader, SkeletonRows, Text, useDelayed } from '@/components/ui';
import { Colors, Fonts, Spacing, Tabular, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { previewOf, shortWhen, type ChatSummary } from '@/lib/chat';
import { useChat } from '@/lib/chat-live';

// Everyone this person can chat with, newest conversation first, like WhatsApp's Chats tab.
// Unread chats are marked in the text colour (bold time, filled count), never in orange.
export function ChatList({
  title,
  maxWidth,
  empty,
}: {
  title: string;
  maxWidth: number;
  empty: { title: string; message: string; action?: ReactNode };
}) {
  const { chats, ready, refresh } = useChat();
  const { session } = useAuth();
  const me = session?.user.id ?? '';
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const showSkeleton = useDelayed(300);

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

  const rows = ready ? chats : [];
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={rows}
        keyExtractor={(chat) => chat.chat_id}
        contentContainerStyle={[styles.list, { maxWidth }]}
        refreshControl={
          ready ? (
            <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={Colors.textSecondary} />
          ) : undefined
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <PageHeader title={title} />
            {!ready && !failed && showSkeleton ? <SkeletonRows count={4} avatar /> : null}
          </View>
        }
        ListEmptyComponent={
          !ready && failed ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Chats could not be loaded"
              message="Check your internet connection and try again."
              action={<Button title="Try again" variant="secondary" onPress={pull} loading={refreshing} />}
            />
          ) : ready ? (
            <EmptyState icon="chatbubbles-outline" title={empty.title} message={empty.message} action={empty.action} />
          ) : null
        }
        renderItem={({ item, index }) => (
          <View style={groupedItem(index, rows.length)}>
            <ChatRow chat={item} me={me} last={index === rows.length - 1} />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

function ChatRow({ chat, me, last }: { chat: ChatSummary; me: string; last: boolean }) {
  const mine = chat.last_sender_id === me && chat.last_kind !== 'call';
  const missed =
    chat.last_kind === 'call' &&
    chat.last_sender_id !== me &&
    ['missed', 'cancelled', 'busy'].includes(chat.last_call_status ?? '');
  const preview = previewOf(chat, me);
  const unread = chat.unread > 0;
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/chat/[id]',
          params: { id: chat.chat_id, name: chat.other_name, avatar: chat.other_avatar ?? '' },
        })
      }
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        (pressed || hovered) && { backgroundColor: Colors.tint },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${chat.other_name}. ${preview}${unread ? `. ${chat.unread} unread` : ''}`}>
      <Avatar url={chat.other_avatar} name={chat.other_name} size={48} />
      <View style={[styles.body, !last && styles.line]}>
        <View style={styles.top}>
          <Text variant="rowTitle" numberOfLines={1} style={[{ flex: 1 }, unread && { fontFamily: Fonts.textSemi }]}>
            {chat.other_name}
          </Text>
          {chat.last_at ? (
            <Text
              variant="footnote"
              tone={unread ? 'primary' : 'secondary'}
              style={[Tabular, unread && { fontFamily: Fonts.textSemi }]}>
              {shortWhen(chat.last_at)}
            </Text>
          ) : null}
        </View>
        <View style={styles.bottom}>
          {mine ? (
            <Ionicons
              name={chat.last_read_at ? 'checkmark-done' : 'checkmark'}
              size={16}
              color={chat.last_read_at ? Colors.text : Colors.textTertiary}
              accessibilityLabel={chat.last_read_at ? 'Read' : 'Sent'}
            />
          ) : null}
          {chat.last_kind === 'call' ? (
            <Ionicons
              name={chat.last_call_video ? 'videocam-outline' : 'call-outline'}
              size={14}
              color={missed ? Colors.danger : Colors.textSecondary}
            />
          ) : null}
          <Text
            variant="callout"
            tone={missed ? 'danger' : unread ? 'primary' : 'secondary'}
            style={{ flex: 1 }}
            numberOfLines={1}>
            {preview}
          </Text>
          {unread ? (
            <View style={styles.badge}>
              <Text variant="footnote" style={[styles.badgeText, Tabular]}>
                {chat.unread > 99 ? '99+' : chat.unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  list: {
    flexGrow: 1,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Platform.OS === 'web' ? Spacing.four : Spacing.tight,
    paddingBottom: Spacing.hero,
  },
  header: {
    gap: Spacing.section,
    marginBottom: Spacing.section,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    paddingLeft: Spacing.gutter,
  },
  // The hairline starts where the name starts.
  body: {
    flex: 1,
    minWidth: 0,
    minHeight: 76,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: Spacing.tight,
    paddingRight: Spacing.gutter,
  },
  line: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    marginLeft: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.text,
  },
  badgeText: {
    color: Colors.background,
    fontFamily: Fonts.textSemi,
    fontSize: 12,
    lineHeight: 16,
  },
}));
