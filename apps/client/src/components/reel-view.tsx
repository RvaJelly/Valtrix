import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Spacing } from '@/constants/theme';
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
}: Props) {
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
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
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

      <View style={[styles.side, { bottom: bottomInset + Spacing.four }]}>
        <Action
          icon={reel.liked_by_me ? 'heart' : 'heart-outline'}
          color={reel.liked_by_me ? '#FF3B5C' : '#FFFFFF'}
          label={reel.liked_by_me ? 'Unlike' : 'Like'}
          selected={reel.liked_by_me}
          count={compactCount(reel.like_count)}
          onPress={onLike}
        />
        <Action
          icon="chatbubble-ellipses-outline"
          label="Comments"
          count={compactCount(reel.comment_count)}
          onPress={onComments}
        />
        <Action icon="paper-plane-outline" label="Share" count="Share" onPress={onShare} />
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
          <Avatar url={reel.author_avatar} name={name} size={36} />
          <Text style={styles.name} numberOfLines={1}>
            {reel.is_mine ? 'You' : name}
          </Text>
          <Text style={styles.time}>{timeAgo(reel.created_at)}</Text>
        </Pressable>
        {reel.caption ? (
          <View pointerEvents="none">
            <Text style={styles.caption} numberOfLines={3}>
              {reel.caption}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// A round, see-through dark button so the icon stands out on any video, with its count under it.
function Action({
  icon,
  color = '#FFFFFF',
  label,
  selected,
  count,
  onPress,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  color?: string;
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
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}>
      <View style={styles.circle}>
        <Ionicons name={icon} size={28} color={color} />
      </View>
      {count ? <Text style={styles.count}>{count}</Text> : null}
    </Pressable>
  );
}

// Reels are always white on black, whatever the app's theme.
const shadow = { textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };

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
    alignItems: 'center',
    gap: Spacing.three,
  },
  action: {
    alignItems: 'center',
    gap: 3,
    minWidth: 56,
  },
  circle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
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
    right: 84,
    gap: Spacing.two,
  },
  author: {
    alignSelf: 'flex-start',
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
    color: 'rgba(255,255,255,0.85)',
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
