import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useEffectEvent, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { OnVideoButton } from '@/components/on-video-button';
import { PostMenu } from '@/components/post-menu';
import { ReelView } from '@/components/reel-view';
import { ShareSheet } from '@/components/share-sheet';
import { Button, Text, useDelayed } from '@/components/ui';
import { BRAND, Spacing, withAlpha } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { loadReels, setLiked, sharedCount, type Reel } from '@/lib/posts';
import { loadCounts, type PostCounts } from '@/lib/social';

const PAGE = 20;

function newReel() {
  router.push({ pathname: '/posts/new', params: { kind: 'reel' } });
}

// Short videos from trainers and clients on Voltrix, one per screen, like Instagram Reels.
// Swipe up for the next one; tap to turn the sound on or off.
export default function Reels() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  // Browsers only autoplay videos without sound.
  const [muted, setMuted] = useState(Platform.OS === 'web');
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [menuReel, setMenuReel] = useState<Reel | null>(null);
  const [commentsReel, setCommentsReel] = useState<Reel | null>(null);
  const [shareReel, setShareReel] = useState<Reel | null>(null);
  const list = useRef<FlatList<Reel>>(null);
  // How many posts this phone had shared when the feed loaded, and the reel on screen.
  const loadedAt = useRef(-1);
  const onScreen = useRef(0);
  // Set when the feed loads again, to start from its first reel.
  const toTop = useRef(false);
  const slow = useDelayed(400);

  const load = useCallback(async () => {
    try {
      const first = await loadReels();
      setReels(first);
      setHasMore(first.length >= PAGE);
      setActive(0);
      onScreen.current = 0;
      toTop.current = true;
      setError(null);
    } catch (e) {
      setError(plainError(e, 'Could not load reels.'));
    }
  }, []);

  function updateCounts(counts: Map<string, PostCounts>) {
    setReels(
      (current) =>
        current?.map((r) => {
          const c = counts.get(r.id);
          return c ? { ...r, like_count: c.like_count, comment_count: c.comment_count, liked_by_me: c.liked_by_me } : r;
        }) ?? null,
    );
  }

  // Each time the tab (or the app) is opened again, show what changed meanwhile. At the
  // first reel the feed loads again, so new reels come in on top. Further down only the
  // likes and comments are updated, so the reel being watched stays where it is.
  const catchUp = useEffectEvent(async () => {
    if (loadedAt.current !== sharedCount() || !reels) {
      // The first time, after this phone shares something, or after it failed.
      loadedAt.current = sharedCount();
      return load();
    }
    try {
      if (onScreen.current === 0) {
        const fresh = await loadReels();
        if (onScreen.current === 0) {
          toTop.current = true;
          setReels(fresh);
          setHasMore(fresh.length >= PAGE);
          setActive(0);
        } else {
          updateCounts(new Map(fresh.map((r) => [r.id, r])));
        }
      } else {
        updateCounts(await loadCounts(reels.map((r) => r.id)));
      }
    } catch {
      // The feed stays as it was; pulling down (or Refresh on a computer) tries again.
    }
  });

  useEffect(() => {
    if (!focused) return;
    // Just after the tab appears, so switching tabs stays quick.
    const timer = setTimeout(() => catchUp(), 0);
    return () => clearTimeout(timer);
  }, [focused]);

  const backInApp = useEffectEvent(() => {
    if (focused) catchUp();
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') backInApp();
    });
    return () => sub.remove();
  }, []);

  // Done once the new list is drawn: a browser otherwise keeps the reel that was on
  // screen in view when new ones appear above it.
  useEffect(() => {
    if (!toTop.current) return;
    toTop.current = false;
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [reels]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function loadMore() {
    const last = reels?.at(-1);
    if (!reels || !last || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await loadReels(last.created_at);
      setReels((current) => [...(current ?? []), ...next.filter((n) => !current?.some((r) => r.id === n.id))]);
      setHasMore(next.length >= PAGE);
    } catch {
      // Scrolling to the end again tries once more.
    }
    setLoadingMore(false);
  }

  function change(id: string, changes: (reel: Reel) => Partial<Reel>) {
    setReels((current) => current?.map((r) => (r.id === id ? { ...r, ...changes(r) } : r)) ?? null);
  }

  async function toggleLike(reel: Reel) {
    const liked = !reel.liked_by_me;
    change(reel.id, (r) => ({ liked_by_me: liked, like_count: Math.max(0, r.like_count + (liked ? 1 : -1)) }));
    try {
      await setLiked(reel.id, liked);
    } catch {
      change(reel.id, (r) => ({ liked_by_me: !liked, like_count: Math.max(0, r.like_count + (liked ? -1 : 1)) }));
    }
  }

  function countComments(postId: string, delta: number) {
    change(postId, (r) => ({ comment_count: Math.max(0, r.comment_count + delta) }));
  }

  function removeFromView(post: { id: string; author_id: string }, why: 'deleted' | 'reported' | 'blocked') {
    setMenuReel(null);
    setReels(
      (current) =>
        current?.filter((r) => (why === 'blocked' ? r.author_id !== post.author_id : r.id !== post.id)) ?? null,
    );
  }

  // Someone was blocked from the comments: their reels go too, and so do the comments if it was the reel's author.
  function blockedFromComments(personId: string) {
    if (commentsReel?.author_id === personId) setCommentsReel(null);
    removeFromView({ id: '', author_id: personId }, 'blocked');
  }

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {focused ? <StatusBar style="light" /> : null}

      {reels && reels.length && height ? (
        <FlatList
          ref={list}
          data={reels}
          keyExtractor={(r) => r.id}
          renderItem={({ item, index }) => (
            <ReelView
              reel={item}
              height={height}
              topInset={insets.top}
              playing={focused && index === active && !menuReel}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onLike={() => toggleLike(item)}
              onComments={() => setCommentsReel(item)}
              onShare={() => setShareReel(item)}
              onMenu={() => setMenuReel(item)}
              showMute={false}
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.y / height);
            onScreen.current = index;
            if (index !== active) setActive(index);
          }}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          onEndReached={loadMore}
          onEndReachedThreshold={2}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={BRAND.white} />}
        />
      ) : null}

      {reels && !reels.length ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="film-outline" size={28} color={BRAND.white} />
          </View>
          <Text variant="headline" style={styles.onVideo}>
            No reels yet
          </Text>
          <Text variant="callout" style={styles.emptyText}>
            Share a short training video. Everyone on Voltrix, clients and trainers, can watch it.
          </Text>
          <Button title="Post a reel" icon="camera-outline" onPress={newReel} />
        </View>
      ) : null}
      {!reels && !error && slow ? (
        <ActivityIndicator color={withAlpha(BRAND.white, 0.6)} style={StyleSheet.absoluteFill} />
      ) : null}
      {error ? (
        <View style={styles.empty}>
          <Text variant="callout" style={styles.emptyText}>
            {error}
          </Text>
          <OnVideoButton title="Try again" onPress={refresh} loading={refreshing} />
        </View>
      ) : null}

      {/* A soft fade at the top keeps the title and buttons readable on any video. */}
      <View style={[styles.topScrim, { height: insets.top + 96 }, TOP_FADE]} pointerEvents="none" />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <Text variant="title" style={styles.onVideo} accessibilityRole="header">
          Reels
        </Text>
        <View style={styles.headerButtons}>
          {reels?.length ? (
            <TopButton
              icon={muted ? 'volume-mute-outline' : 'volume-high-outline'}
              label={muted ? 'Turn sound on' : 'Turn sound off'}
              onPress={() => setMuted((m) => !m)}
            />
          ) : null}
          <TopButton icon="camera-outline" label="Post a reel" onPress={newReel} />
        </View>
      </View>

      <PostMenu post={menuReel} kind="reel" onClose={() => setMenuReel(null)} onRemoved={removeFromView} />
      <CommentsSheet
        reel={commentsReel}
        onClose={() => setCommentsReel(null)}
        onCountChange={countComments}
        // The tab bar below already keeps clear of the phone's bottom bar.
        bottomInset={0}
        onBlocked={blockedFromComments}
      />
      <ShareSheet reel={shareReel} onClose={() => setShareReel(null)} />
    </View>
  );
}

// A white outline icon on the video, 44 across for the finger.
function TopButton({
  icon,
  label,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.headerButton, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={24} color={BRAND.white} />
    </Pressable>
  );
}

// Reels are always white on black, whatever the app's theme.
const FADE = `linear-gradient(to bottom, ${withAlpha(BRAND.iron, 0.55)}, ${withAlpha(BRAND.iron, 0)})`;
const TOP_FADE = (
  Platform.OS === 'web' ? { backgroundImage: FADE } : { experimental_backgroundImage: FADE }
) as ViewStyle;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BRAND.iron,
  },
  topScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.gutter,
    paddingRight: Spacing.two,
    paddingBottom: Spacing.two,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onVideo: {
    color: BRAND.white,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.tight,
    padding: Spacing.four,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(BRAND.white, 0.12),
  },
  emptyText: {
    color: withAlpha(BRAND.white, 0.75),
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: Spacing.two,
  },
});
