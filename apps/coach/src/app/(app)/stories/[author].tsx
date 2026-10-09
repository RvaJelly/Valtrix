import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { LikersSheet } from '@/components/likers-sheet';
import { PostMenu } from '@/components/post-menu';
import { Spacing } from '@/constants/theme';
import {
  authorName,
  loadSeen,
  loadStories,
  markSeen,
  mediaUrl,
  setLiked,
  timeAgo,
  type Story,
  type StoryGroup,
} from '@/lib/posts';
import { compactCount, loadCounts, type PostCounts } from '@/lib/social';

// How long a photo story stays on screen.
const PHOTO_MS = 5000;
const TICK_MS = 50;

type Position = { group: number; story: number };

function firstUnseen(group: StoryGroup, seen: Set<string>) {
  const index = group.stories.findIndex((s) => !seen.has(s.id));
  return index < 0 ? 0 : index;
}

// Back to where the stories were opened from, or Home when there is nothing to go
// back to (a reloaded page or a link).
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// Full-screen stories, like Instagram: tap the right side for the next one, the
// left side to go back, and hold to pause. Plays on through the next people's stories.
export default function StoryViewer() {
  const { author } = useLocalSearchParams<{ author: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [groups, setGroups] = useState<StoryGroup[] | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [position, setPosition] = useState<Position>({ group: 0, story: 0 });
  const [error, setError] = useState<string | null>(null);
  // How far through the current story we are, from 0 to 1.
  const [progress, setProgress] = useState({ id: '', fraction: 0 });
  const [readyId, setReadyId] = useState<string | null>(null);
  const [held, setHeld] = useState(false);
  const [menuPost, setMenuPost] = useState<Story | null>(null);
  // Likes on each story: whether this person liked it, and how many likes their own have.
  const [counts, setCounts] = useState<Map<string, PostCounts>>(new Map());
  // The own story whose "Liked by" list is open.
  const [likersFor, setLikersFor] = useState<string | null>(null);
  // Bumped to play the current story again from the start.
  const [replay, setReplay] = useState(0);
  const elapsed = useRef({ id: '', ms: 0 });

  useEffect(() => {
    Promise.all([loadStories(), loadSeen()])
      .then(([all, seenBefore]) => {
        const start = all.findIndex((g) => g.author_id === author);
        if (start < 0) return setError('This story has ended.');
        const shown = all.slice(start);
        setSeen(seenBefore);
        setGroups(shown);
        setPosition({ group: 0, story: firstUnseen(shown[0], seenBefore) });
        // Without the likes the stories still play. A story liked or unliked before the
        // counts arrive keeps what was tapped (the counts may have been worked out before it).
        loadCounts(shown.flatMap((g) => g.stories.map((st) => st.id))).then(
          (loaded) =>
            setCounts((current) => {
              const next = new Map(loaded);
              for (const [id, c] of current) next.set(id, c);
              return next;
            }),
          () => {},
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load stories.'));
  }, [author]);

  const group = groups?.[position.group];
  const story = group?.stories[position.story];
  const paused = held || !!menuPost || !!likersFor;
  const fraction = progress.id === story?.id ? progress.fraction : 0;

  const storyId = story?.id;
  useEffect(() => {
    if (storyId) markSeen(storyId);
  }, [storyId]);

  function goNext() {
    if (!groups || !group) return;
    if (position.story + 1 < group.stories.length) {
      setPosition({ group: position.group, story: position.story + 1 });
    } else if (position.group + 1 < groups.length) {
      setPosition({ group: position.group + 1, story: firstUnseen(groups[position.group + 1], seen) });
    } else {
      close();
    }
  }

  function goBack() {
    if (position.story > 0) {
      setPosition({ group: position.group, story: position.story - 1 });
    } else if (position.group > 0) {
      setPosition({ group: position.group - 1, story: 0 });
    } else {
      elapsed.current = { id: '', ms: 0 };
      setProgress({ id: '', fraction: 0 });
      setReplay((r) => r + 1);
    }
  }

  const photoDone = useEffectEvent(() => goNext());

  // Photo stories run on a timer once the photo has loaded.
  const photoRunning = !!story && story.media_type === 'image' && readyId === story.id && !paused;
  useEffect(() => {
    if (!photoRunning || !storyId) return;
    if (elapsed.current.id !== storyId) elapsed.current = { id: storyId, ms: 0 };
    const timer = setInterval(() => {
      const ms = elapsed.current.ms + TICK_MS;
      elapsed.current = { id: storyId, ms };
      if (ms >= PHOTO_MS) {
        clearInterval(timer);
        photoDone();
      } else {
        setProgress({ id: storyId, fraction: ms / PHOTO_MS });
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [photoRunning, storyId, replay]);

  function setCount(id: string, changes: (current: PostCounts) => Partial<PostCounts>) {
    setCounts((all) => {
      const current = all.get(id) ?? { like_count: 0, comment_count: 0, liked_by_me: false };
      return new Map(all).set(id, { ...current, ...changes(current) });
    });
  }

  async function toggleLike(id: string) {
    const liked = !counts.get(id)?.liked_by_me;
    setCount(id, (c) => ({ liked_by_me: liked, like_count: Math.max(0, c.like_count + (liked ? 1 : -1)) }));
    try {
      await setLiked(id, liked);
    } catch {
      setCount(id, (c) => ({ liked_by_me: !liked, like_count: Math.max(0, c.like_count + (liked ? -1 : 1)) }));
    }
  }

  // Take a story or a person out of what is shown, after a delete, report or block.
  function removeFromView(post: { id: string; author_id: string }, why: 'deleted' | 'reported' | 'blocked') {
    setMenuPost(null);
    if (!groups || !group) return;
    const remaining = groups
      .map((g) =>
        why === 'blocked' && g.author_id === post.author_id
          ? { ...g, stories: [] }
          : { ...g, stories: g.stories.filter((s) => s.id !== post.id) },
      )
      .filter((g) => g.stories.length);
    let index = remaining.findIndex((g) => g.author_id === group.author_id);
    let storyIndex = position.story;
    if (index < 0) {
      // That person has nothing left to show; carry on with the next person.
      const after = groups.slice(position.group + 1).find((g) => remaining.some((r) => r.author_id === g.author_id));
      if (!after) return close();
      index = remaining.findIndex((r) => r.author_id === after.author_id);
      storyIndex = 0;
    } else if (storyIndex >= remaining[index].stories.length) {
      if (index + 1 >= remaining.length) return close();
      index += 1;
      storyIndex = 0;
    }
    setGroups(remaining);
    setPosition({ group: index, story: storyIndex });
  }

  if (error || !groups || !group || !story) {
    return (
      <View style={[styles.screen, styles.center]}>
        <StatusBar style="light" />
        {error ? <Text style={styles.message}>{error}</Text> : <ActivityIndicator color="#FFFFFF" />}
        {error ? <CloseButton top={insets.top} /> : null}
      </View>
    );
  }

  const url = mediaUrl(story.media_path);
  const name = authorName(group);
  const liked = !!counts.get(story.id)?.liked_by_me;
  const likes = counts.get(story.id)?.like_count ?? 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={StyleSheet.absoluteFill}>
        {story.media_type === 'image' ? (
          <Image
            key={`${story.id}-${replay}`}
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            onLoad={() => setReadyId(story.id)}
            onError={() => setReadyId(story.id)}
            accessibilityLabel={`Story from ${name}`}
          />
        ) : (
          <VideoStory
            key={`${story.id}-${replay}`}
            url={url}
            paused={paused}
            onReady={() => setReadyId(story.id)}
            onProgress={(f) => setProgress({ id: story.id, fraction: f })}
            onEnd={goNext}
          />
        )}
      </View>
      {readyId !== story.id ? <ActivityIndicator color="#FFFFFF" style={StyleSheet.absoluteFill} /> : null}

      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Next story"
        onPress={(e) => (e.nativeEvent.pageX < width / 3 ? goBack() : goNext())}
        onLongPress={() => setHeld(true)}
        delayLongPress={250}
        onPressOut={() => setHeld(false)}
      />

      <View style={[styles.top, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {group.stories.map((s, i) => (
            <View key={s.id} style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${(i < position.story ? 1 : i === position.story ? fraction : 0) * 100}%` },
                ]}
              />
            </View>
          ))}
        </View>
        <View style={styles.header} pointerEvents="box-none">
          <Avatar url={group.author_avatar} name={name} size={34} />
          <Text style={styles.name} numberOfLines={1}>
            {group.is_mine ? 'Your story' : name}
          </Text>
          <Text style={styles.time}>{timeAgo(story.created_at)}</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            hitSlop={10}
            onPress={() => setMenuPost(story)}>
            <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close}>
            <Ionicons name="close" size={30} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={[styles.bottom, { bottom: insets.bottom + Spacing.three }]} pointerEvents="box-none">
        {group.is_mine ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`See who liked your story, ${likes} ${likes === 1 ? 'like' : 'likes'}`}
            onPress={() => setLikersFor(story.id)}
            hitSlop={8}
            style={styles.likesPill}>
            <Ionicons name="heart" size={18} color="#FF3B5C" />
            <Text style={styles.likesText}>
              {likes ? `${compactCount(likes)} ${likes === 1 ? 'like' : 'likes'}` : 'No likes yet'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Unlike story' : 'Like story'}
            accessibilityState={{ selected: liked }}
            onPress={() => toggleLike(story.id)}
            hitSlop={8}
            style={({ pressed }) => [styles.heart, pressed && { transform: [{ scale: 0.92 }] }]}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={32} color={liked ? '#FF3B5C' : '#FFFFFF'} />
          </Pressable>
        )}
      </View>

      <PostMenu post={menuPost} kind="story" onClose={() => setMenuPost(null)} onRemoved={removeFromView} />
      <LikersSheet
        postId={likersFor}
        onClose={() => setLikersFor(null)}
        onLoaded={(id, count) => setCount(id, () => ({ like_count: count }))}
      />
    </View>
  );
}

function VideoStory({
  url,
  paused,
  onReady,
  onProgress,
  onEnd,
}: {
  url: string;
  paused: boolean;
  onReady: () => void;
  onProgress: (fraction: number) => void;
  onEnd: () => void;
}) {
  const player = useVideoPlayer(url, (p) => {
    p.timeUpdateEventInterval = 0.1;
  });
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') onReady();
    // A video that can't play is skipped.
    if (status === 'error') onEnd();
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (player.duration > 0) onProgress(Math.min(1, currentTime / player.duration));
  });
  useEventListener(player, 'playToEnd', onEnd);

  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused, player]);

  return <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />;
}

function CloseButton({ top }: { top: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={10}
      onPress={close}
      style={{ position: 'absolute', top: top + Spacing.three, right: Spacing.three }}>
      <Ionicons name="close" size={30} color="#FFFFFF" />
    </Pressable>
  );
}

// Stories are always shown on black, whatever the app's theme.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  // A width and height, not just the four edges: on the web the video is a <video> tag,
  // which otherwise keeps its own size and shows only its top-left corner.
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  bars: {
    flexDirection: 'row',
    gap: 4,
  },
  bar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  barFill: {
    height: 3,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  name: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  time: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  bottom: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  heart: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  likesPill: {
    marginRight: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  likesText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
