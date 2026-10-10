import { Ionicons } from '@expo/vector-icons';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommentsSheet } from '@/components/comments-sheet';
import { OnVideoButton } from '@/components/on-video-button';
import { PostMenu } from '@/components/post-menu';
import { ReelView } from '@/components/reel-view';
import { ShareSheet } from '@/components/share-sheet';
import { Text, useDelayed } from '@/components/ui';
import { BRAND, Spacing, withAlpha } from '@/constants/theme';
import { useGoBack } from '@/lib/nav';
import { setLiked, type Reel } from '@/lib/posts';
import { loadReelsByIds } from '@/lib/social';
import { listTrainers } from '@/lib/trainers';

function openTrainer(id: string) {
  router.push({ pathname: '/trainers/[id]', params: { id } });
}

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
  // Trainers on Voltrix, so their name opens their profile.
  const [trainerIds, setTrainerIds] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  // A spinner only when loading is slow.
  const slow = useDelayed(400);

  useEffect(() => {
    Promise.all([loadReelsByIds([id]), listTrainers().catch(() => [])]).then(
      ([found, trainers]) => {
        setTrainerIds(new Set(trainers.map((t) => t.id)));
        setFailed(false);
        setReel(found[0] ?? null);
      },
      () => setFailed(true),
    );
  }, [id, attempt]);

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
          onAuthor={!reel.is_mine && trainerIds.has(reel.author_id) ? () => openTrainer(reel.author_id) : undefined}
        />
      ) : null}
      {reel === undefined && !failed && slow ? (
        <ActivityIndicator color="rgba(255,255,255,0.5)" style={StyleSheet.absoluteFill} />
      ) : null}
      {reel === null || failed ? (
        <View style={styles.gone}>
          <View style={styles.goneIcon}>
            <Ionicons name="film-outline" size={28} color={BRAND.white} />
          </View>
          <Text variant="headline" style={styles.goneTitle}>
            {failed ? 'Could not load this reel' : 'This reel is no longer available'}
          </Text>
          {failed ? (
            <>
              <Text variant="callout" style={styles.goneText}>
                Check your internet and try again.
              </Text>
              <OnVideoButton
                title="Try again"
                onPress={() => {
                  setFailed(false);
                  setAttempt((a) => a + 1);
                }}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {/* A soft fade at the top keeps the title and Back readable on any video. */}
      <View style={[styles.topScrim, { height: insets.top + 96 }, TOP_FADE]} pointerEvents="none" />
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          onPress={close}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}>
          <Ionicons name="chevron-back" size={24} color={BRAND.white} />
        </Pressable>
        <Text variant="title" style={styles.title}>
          Reel
        </Text>
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
            isTrainer={(person) => trainerIds.has(person)}
            onOpenAuthor={(person) => {
              setCommentsOpen(false);
              openTrainer(person);
            }}
          />
          <ShareSheet reel={shareOpen ? reel : null} onClose={() => setShareOpen(false)} />
        </>
      ) : null}
    </View>
  );
}

// Reels are always white on black, whatever the app's theme.
const shadow = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };

const FADE = `linear-gradient(to bottom, ${withAlpha(BRAND.iron, 0.55)}, ${withAlpha(BRAND.iron, 0)})`;
const TOP_FADE = (
  Platform.OS === 'web' ? { backgroundImage: FADE } : { experimental_backgroundImage: FADE }
) as ViewStyle;

const styles = StyleSheet.create({
  topScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  screen: {
    flex: 1,
    backgroundColor: BRAND.iron,
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
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: {
    color: BRAND.white,
    ...shadow,
  },
  gone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.tight,
    padding: Spacing.four,
  },
  goneIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing.one,
  },
  goneTitle: {
    color: BRAND.white,
    textAlign: 'center',
  },
  goneText: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
});
