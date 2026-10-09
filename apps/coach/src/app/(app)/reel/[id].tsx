import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { PostMenu } from '@/components/post-menu';
import { ReelView } from '@/components/reel-view';
import { ShareSheet } from '@/components/share-sheet';
import { Spacing } from '@/constants/theme';
import { useGoBack } from '@/lib/nav';
import { setLiked, type Reel } from '@/lib/posts';
import { loadReelsByIds } from '@/lib/social';

// One reel full screen, for example one sent in a chat.
export default function ReelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  // Undefined while loading; null when the reel is gone or can't be seen.
  const [reel, setReel] = useState<Reel | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState(0);
  // Browsers only autoplay videos without sound.
  const [muted, setMuted] = useState(Platform.OS === 'web');
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    loadReelsByIds([id]).then(
      (found) => setReel(found[0] ?? null),
      () => setFailed(true),
    );
  }, [id]);

  function change(changes: (current: Reel) => Partial<Reel>) {
    setReel((current) => (current ? { ...current, ...changes(current) } : current));
  }

  async function toggleLike(current: Reel) {
    const liked = !current.liked_by_me;
    change((r) => ({ liked_by_me: liked, like_count: Math.max(0, r.like_count + (liked ? 1 : -1)) }));
    try {
      await setLiked(current.id, liked);
    } catch {
      change((r) => ({ liked_by_me: !liked, like_count: Math.max(0, r.like_count + (liked ? -1 : 1)) }));
    }
  }

  function close() {
    goBack('/reels');
  }

  function blockedFromComments(personId: string) {
    if (reel?.author_id === personId) close();
  }

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <StatusBar style="light" />
      {reel && height ? (
        <ReelView
          reel={reel}
          height={height}
          topInset={insets.top}
          bottomInset={insets.bottom}
          playing={focused && !menuOpen}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onLike={() => toggleLike(reel)}
          onComments={() => setCommentsOpen(true)}
          onShare={() => setShareOpen(true)}
          onMenu={() => setMenuOpen(true)}
        />
      ) : null}
      {reel === undefined && !failed ? <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} /> : null}
      {reel === null || failed ? (
        <View style={styles.gone}>
          <Ionicons name="film-outline" size={48} color="#FFFFFF" />
          <Text style={styles.goneText}>
            {failed ? 'Could not load this reel. Check your internet.' : 'This reel is no longer available'}
          </Text>
        </View>
      ) : null}

      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          onPress={close}
          style={styles.back}>
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>Reel</Text>
      </View>

      {reel ? (
        <>
          <PostMenu
            post={menuOpen ? reel : null}
            kind="reel"
            onClose={() => setMenuOpen(false)}
            onRemoved={() => {
              setMenuOpen(false);
              close();
            }}
          />
          <CommentsSheet
            reel={commentsOpen ? reel : null}
            onClose={() => setCommentsOpen(false)}
            onCountChange={(_, delta) => change((r) => ({ comment_count: Math.max(0, r.comment_count + delta) }))}
            bottomInset={insets.bottom}
            onBlocked={blockedFromComments}
          />
          <ShareSheet reel={shareOpen ? reel : null} onClose={() => setShareOpen(false)} />
        </>
      ) : null}
    </View>
  );
}

// Reels are always white on black, whatever the app's theme.
const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.two,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    ...shadow,
  },
  gone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  goneText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 17,
    textAlign: 'center',
  },
});
