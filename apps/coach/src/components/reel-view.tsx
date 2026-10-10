import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { Text } from '@/components/ui';
import { BRAND, Fonts, Spacing, Tabular, withAlpha } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { authorName, mediaUrl, timeAgo, type Reel } from '@/lib/posts';
import { compactCount } from '@/lib/social';

type Props = {
  reel: Reel;
  height: number;
  topInset: number;
  // Space taken by the phone's own bar at the bottom (home indicator or Back/Home buttons).
  // 0 on the Reels tab, where the tab bar already keeps clear of it.
  bottomInset?: number;
  playing: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onLike: () => void;
  onComments: () => void;
  onShare: () => void;
  onMenu: () => void;
  // Set when the author is a trainer: their name opens their profile.
  onAuthor?: () => void;
  // The small muted sign at the top right. Off where the screen's own bar has a sound button.
  showMute?: boolean;
};

function setPlayerMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

// One reel filling the screen, with Like, Comment, Share and "..." down the right
// side like Instagram and TikTok. Tap the video to turn the sound on or off.
export function ReelView({
  reel,
  height,
  topInset,
  bottomInset = 0,
  playing,
  muted,
  onToggleMute,
  onLike,
  onComments,
  onShare,
  onMenu,
  onAuthor,
  showMute = true,
}: Props) {
  const player = useVideoPlayer(mediaUrl(reel.media_path), (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const [ready, setReady] = useState(false);
  const name = authorName(reel);
  // A phone reel is tall. In a landscape window (a computer) it is shown whole, with black at the
  // sides, instead of cropped to its middle.
  const landscape = useWindowDimensions().width > height;

  useEventListener(player, 'statusChange', ({ status }) => setReady(status === 'readyToPlay'));

  useEffect(() => {
    setPlayerMuted(player, muted);
  }, [player, muted]);

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);

  return (
    <View style={{ height, backgroundColor: BRAND.iron }}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit={landscape ? 'contain' : 'cover'}
        nativeControls={false}
      />
      {!ready ? <ActivityIndicator color={withAlpha(BRAND.white, 0.6)} style={StyleSheet.absoluteFill} /> : null}
      {/* A soft dark fade at the bottom keeps the name and caption readable on any video. */}
      <View style={[styles.scrim, SCRIM]} pointerEvents="none" />
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
        onPress={onToggleMute}
      />

      {muted && showMute ? (
        <View style={[styles.mute, { top: topInset + 56 }]} pointerEvents="none">
          <Ionicons name="volume-mute-outline" size={16} color={BRAND.white} />
        </View>
      ) : null}

      <View style={[styles.side, { bottom: bottomInset + Spacing.four }]}>
        <Action
          icon={reel.liked_by_me ? 'heart' : 'heart-outline'}
          label={reel.liked_by_me ? 'Unlike' : 'Like'}
          selected={reel.liked_by_me}
          count={reel.like_count ? compactCount(reel.like_count) : undefined}
          onPress={onLike}
        />
        <Action
          icon="chatbubble-outline"
          label="Comments"
          count={reel.comment_count ? compactCount(reel.comment_count) : undefined}
          onPress={onComments}
        />
        <Action icon="paper-plane-outline" label="Share" onPress={onShare} />
        <Action icon="ellipsis-horizontal" label="More options" onPress={onMenu} />
      </View>

      <View style={[styles.info, { bottom: bottomInset + Spacing.four }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole={onAuthor ? 'button' : undefined}
          accessibilityLabel={onAuthor ? `See ${name}'s profile` : undefined}
          onPress={onAuthor}
          disabled={!onAuthor}
          pointerEvents={onAuthor ? 'auto' : 'none'}
          hitSlop={6}
          style={styles.author}>
          <Avatar url={reel.author_avatar} name={name} size={32} />
          <Text variant="callout" numberOfLines={1} style={styles.name}>
            {reel.is_mine ? 'You' : name}
          </Text>
          <Text variant="footnote" style={styles.time}>
            {timeAgo(reel.created_at)}
          </Text>
        </Pressable>
        {reel.caption ? (
          <View pointerEvents="none">
            <Text variant="callout" style={styles.caption} numberOfLines={3}>
              {reel.caption}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// A round, see-through dark button with a white outline icon, so it stands out on any video, and
// its count under it (none at 0).
function Action({
  icon,
  label,
  selected,
  count,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  selected?: boolean;
  count?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
      <View style={styles.circle}>
        <Ionicons name={icon} size={24} color={BRAND.white} />
      </View>
      {count ? (
        <Text variant="footnote" style={styles.count}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Reels are always white on black, whatever the app's theme.
const FADE = `linear-gradient(to bottom, ${withAlpha(BRAND.iron, 0)}, ${withAlpha(BRAND.iron, 0.65)})`;
const SCRIM = (Platform.OS === 'web' ? { backgroundImage: FADE } : { experimental_backgroundImage: FADE }) as ViewStyle;

const styles = StyleSheet.create({
  // A width and height, not just the four edges: on the web the video is a <video> tag,
  // which otherwise keeps its own size and shows only its top-left corner.
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  mute: {
    position: 'absolute',
    right: Spacing.three,
    padding: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  side: {
    position: 'absolute',
    right: Spacing.tight,
    alignItems: 'center',
    gap: Spacing.three,
  },
  action: {
    alignItems: 'center',
    gap: Spacing.one,
    minWidth: 48,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  count: {
    color: BRAND.white,
    fontFamily: Fonts.textMedium,
    ...Tabular,
  },
  info: {
    position: 'absolute',
    left: Spacing.gutter,
    right: 76,
    gap: Spacing.two,
  },
  author: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  name: {
    flexShrink: 1,
    color: BRAND.white,
    fontFamily: Fonts.textSemi,
  },
  time: {
    color: withAlpha(BRAND.white, 0.7),
  },
  caption: {
    color: BRAND.white,
  },
});
