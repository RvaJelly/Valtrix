import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { PostMenu } from '@/components/post-menu';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { authorName, loadReels, mediaUrl, setLiked, sharedCount, timeAgo, type Reel } from '@/lib/posts';

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

  function change(id: string, changes: Partial<Reel>) {
    setReels((current) => current?.map((r) => (r.id === id ? { ...r, ...changes } : r)) ?? null);
  }

  async function toggleLike(reel: Reel) {
    const liked = !reel.liked_by_me;
    change(reel.id, { liked_by_me: liked, like_count: Math.max(0, reel.like_count + (liked ? 1 : -1)) });
    try {
      await setLiked(reel.id, liked);
    } catch {
      change(reel.id, { liked_by_me: reel.liked_by_me, like_count: reel.like_count });
    }
  }

  function removeFromView(post: { id: string; author_id: string }, why: 'deleted' | 'reported' | 'blocked') {
    setMenuReel(null);
    setReels(
      (current) =>
        current?.filter((r) => (why === 'blocked' ? r.author_id !== post.author_id : r.id !== post.id)) ?? null,
    );
  }

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {focused ? <StatusBar style="light" /> : null}

      {reels && reels.length && height ? (
        <FlatList
          data={reels}
          keyExtractor={(r) => r.id}
          renderItem={({ item, index }) => (
            <ReelItem
              reel={item}
              height={height}
              topInset={insets.top}
              playing={focused && index === active && !menuReel}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onLike={() => toggleLike(item)}
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
            Share a short training video. Your clients and other trainers will see it.
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
    </View>
  );
}

function setPlayerMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

function ReelItem({
  reel,
  height,
  topInset,
  playing,
  muted,
  onToggleMute,
  onLike,
  onMenu,
}: {
  reel: Reel;
  height: number;
  topInset: number;
  playing: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onMenu: () => void;
}) {
  const player = useVideoPlayer(mediaUrl(reel.media_path), (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const [ready, setReady] = useState(false);
  const name = authorName(reel);

  useEventListener(player, 'statusChange', ({ status }) => setReady(status === 'readyToPlay'));

  useEffect(() => {
    setPlayerMuted(player, muted);
  }, [player, muted]);

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  return (
    <View style={{ height, backgroundColor: '#000000' }}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {!ready ? <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} /> : null}
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
        onPress={onToggleMute}
      />

      {muted ? (
        <View style={[styles.mute, { top: topInset + 56 }]} pointerEvents="none">
          <Ionicons name="volume-mute" size={16} color="#FFFFFF" />
        </View>
      ) : null}

      <View style={styles.side}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={reel.liked_by_me ? 'Unlike' : 'Like'}
          accessibilityState={{ selected: reel.liked_by_me }}
          onPress={onLike}
          hitSlop={8}
          style={styles.action}>
          <Ionicons
            name={reel.liked_by_me ? 'heart' : 'heart-outline'}
            size={32}
            color={reel.liked_by_me ? '#FF3B5C' : '#FFFFFF'}
          />
          <Text style={styles.count}>{reel.like_count}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More options"
          onPress={onMenu}
          hitSlop={8}
          style={styles.action}>
          <Ionicons name="ellipsis-horizontal" size={28} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.info} pointerEvents="none">
        <View style={styles.author}>
          <Avatar url={reel.author_avatar} name={name} size={36} />
          <Text style={styles.name} numberOfLines={1}>
            {reel.is_mine ? 'You' : name}
          </Text>
          <Text style={styles.time}>{timeAgo(reel.created_at)}</Text>
        </View>
        {reel.caption ? (
          <Text style={styles.caption} numberOfLines={3}>
            {reel.caption}
          </Text>
        ) : null}
      </View>
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
  mute: {
    position: 'absolute',
    right: Spacing.three,
    padding: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  side: {
    position: 'absolute',
    right: Spacing.two,
    bottom: Spacing.five,
    alignItems: 'center',
    gap: Spacing.four,
  },
  action: {
    alignItems: 'center',
    gap: 2,
    minWidth: 48,
  },
  count: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    ...shadow,
  },
  info: {
    position: 'absolute',
    left: Spacing.three,
    right: 80,
    bottom: Spacing.four,
    gap: Spacing.two,
  },
  author: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    ...shadow,
  },
  time: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    ...shadow,
  },
  caption: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    ...shadow,
  },
});
