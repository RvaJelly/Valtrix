import { Ionicons } from '@expo/vector-icons';
import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { timeAgo } from '@/lib/posts';
import { loadLikers, type Liker } from '@/lib/social';

type Loaded = { postId: string; likers: Liker[] | null };

// "Liked by": who liked one of your own posts, newest first.
export function LikersSheet({
  postId,
  onClose,
  onLoaded,
}: {
  // The post whose likes are shown, or null when the sheet is closed.
  postId: string | null;
  onClose: () => void;
  // How many people liked it, once the list arrives.
  onLoaded?: (postId: string, count: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const reportCount = useEffectEvent((id: string, count: number) => onLoaded?.(id, count));

  useEffect(() => {
    if (!postId) return;
    let stale = false;
    loadLikers(postId).then(
      (likers) => {
        if (stale) return;
        setLoaded({ postId, likers });
        reportCount(postId, likers.length);
      },
      () => {
        if (!stale) setLoaded({ postId, likers: null });
      },
    );
    return () => {
      stale = true;
    };
  }, [postId]);

  const shown = loaded?.postId === postId ? loaded : null;

  return (
    <Modal visible={!!postId} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { maxHeight: height * 0.7, paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Ionicons name="heart" size={20} color="#FF3B5C" />
          <Text style={styles.title} accessibilityRole="header">
            Liked by
          </Text>
        </View>
        {!shown ? (
          <ActivityIndicator color={Colors.textSecondary} style={{ marginVertical: Spacing.five }} />
        ) : !shown.likers ? (
          <Text style={styles.note}>Could not load who liked this. Check your internet and try again.</Text>
        ) : !shown.likers.length ? (
          <Text style={styles.note}>No likes yet. When people like your story, you&apos;ll see them here.</Text>
        ) : (
          <FlatList
            data={shown.likers}
            keyExtractor={(l) => l.user_id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Avatar url={item.avatar_url} name={item.name} size={44} />
                <Text style={styles.name} numberOfLines={1}>
                  {item.name || 'Voltrix member'}
                </Text>
                <Text style={styles.when}>{timeAgo(item.created_at)}</Text>
              </View>
            )}
          />
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.done, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  note: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
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
  when: {
    color: Colors.textSecondary,
    fontSize: 13,
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
