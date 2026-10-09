import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { PostMenu } from '@/components/post-menu';
import { ReelView } from '@/components/reel-view';
import { ShareSheet } from '@/components/share-sheet';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { loadReels, setLiked, sharedCount, type Reel } from '@/lib/posts';

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
  const loadedAt = useRef(-1);

  const load = useCallback(async () => {
    try {
      const first = await loadReels();
      setReels(first);
      setHasMore(first.length >= PAGE);
      setActive(0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load reels.');
    }
  }, []);

  // Load the first time, and again after this phone shares something.
  useFocusEffect(
    useCallback(() => {
      if (loadedAt.current === sharedCount()) return;
      loadedAt.current = sharedCount();
      load();
    }, [load]),
  );

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
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.y / height);
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
          <Text style={styles.emptyText}>
            Share a short training video. Everyone on Voltrix, clients and trainers, can watch it.
          </Text>
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
        <Pressable accessibilityRole="button" accessibilityLabel="Post a reel" hitSlop={10} onPress={newReel}>
          <Ionicons name="camera-outline" size={28} color="#FFFFFF" />
        </Pressable>
      </View>

      <PostMenu post={menuReel} kind="reel" onClose={() => setMenuReel(null)} onRemoved={removeFromView} />
      <CommentsSheet
        reel={commentsReel}
        onClose={() => setCommentsReel(null)}
        onCountChange={countComments}
        onBlocked={blockedFromComments}
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
