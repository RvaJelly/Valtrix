import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { PostMenu } from '@/components/post-menu';
import { ReelView } from '@/components/reel-view';
import { ShareSheet } from '@/components/share-sheet';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { loadReels, setLiked, sharedCount, type Reel } from '@/lib/posts';
import { loadCounts, type PostCounts } from '@/lib/social';
import { listTrainers } from '@/lib/trainers';

const PAGE = 20;

function newReel() {
  router.push({ pathname: '/posts/new', params: { kind: 'reel' } });
}

function openTrainer(id: string) {
  router.push({ pathname: '/trainers/[id]', params: { id } });
}

// Short videos from everyone on Voltrix, one per screen, like Instagram Reels.
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
  // Trainers on Voltrix, so their name opens their profile.
  const [trainerIds, setTrainerIds] = useState<Set<string>>(new Set());
  const list = useRef<FlatList<Reel>>(null);
  // How many posts this phone had shared when the feed loaded, and the reel on screen.
  const loadedAt = useRef(-1);
  const onScreen = useRef(0);
  // Set when the feed loads again, to start from its first reel.
  const toTop = useRef(false);

  const load = useCallback(async () => {
    try {
      const [first, trainers] = await Promise.all([loadReels(), listTrainers().catch(() => [])]);
      setTrainerIds(new Set(trainers.map((t) => t.id)));
      setReels(first);
      setHasMore(first.length >= PAGE);
      setActive(0);
      onScreen.current = 0;
      toTop.current = true;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reels.');
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

  function openAuthorFromComments(personId: string) {
    setCommentsReel(null);
    openTrainer(personId);
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
              onAuthor={!item.is_mine && trainerIds.has(item.author_id) ? () => openTrainer(item.author_id) : undefined}
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#FFFFFF" />}
        />
      ) : null}

      {reels && !reels.length ? (
        <View style={styles.empty}>
          <Ionicons name="film-outline" size={48} color="#FFFFFF" />
          <Text style={styles.emptyTitle}>No reels yet</Text>
          <Text style={styles.emptyText}>Share a short training video. Everyone on Voltrix will see it.</Text>
          <Button title="Post a reel" onPress={newReel} />
        </View>
      ) : null}
      {!reels && !error ? <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} /> : null}
      {error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{error}</Text>
          <Button title="Try again" onPress={refresh} />
        </View>
      ) : null}

      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <Text style={styles.title}>Reels</Text>
        <View style={styles.headerButtons}>
          {/* Phones pull down to refresh; a mouse can't, so computers get a button. */}
          {Platform.OS === 'web' && reels ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh reels"
              hitSlop={10}
              onPress={refresh}
              disabled={refreshing}
              style={styles.headerButton}>
              {refreshing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Ionicons name="refresh" size={26} color="#FFFFFF" />
              )}
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Post a reel" hitSlop={10} onPress={newReel}>
            <Ionicons name="camera-outline" size={28} color="#FFFFFF" />
          </Pressable>
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
        isTrainer={(id) => trainerIds.has(id)}
        onOpenAuthor={openAuthorFromComments}
      />
      <ShareSheet reel={shareReel} onClose={() => setShareReel(null)} />
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  headerButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    ...shadow,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
});
