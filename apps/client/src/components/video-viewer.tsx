import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { videoLink } from '@/lib/workout-videos';

type Props = {
  // The video to show; null keeps the viewer closed.
  path: string | null;
  title?: string;
  onClose: () => void;
  // Extra buttons under the video.
  children?: ReactNode;
};

// A workout video full screen, white on black like the reels, with the phone's own
// play, pause and seek controls.
export function VideoViewer({ path, title, onClose, children }: Props) {
  return (
    <Modal
      visible={!!path}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}>
      {/* Black even while it fades away, so closing doesn't flash white. */}
      <View style={styles.screen}>
        {path ? (
          <ViewerBody key={path} path={path} title={title} onClose={onClose}>
            {children}
          </ViewerBody>
        ) : null}
      </View>
    </Modal>
  );
}

function ViewerBody({ path, title, onClose, children }: Props & { path: string }) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    videoLink(path)
      .then((link) => live && setUrl(link))
      .catch((e: unknown) => live && setError(plainError(e)));
    return () => {
      live = false;
    };
  }, [path]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.three }}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close video" hitSlop={12} onPress={onClose}>
          <Ionicons name="close" size={30} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? 'Video'}
        </Text>
      </View>
      <View style={styles.video}>
        {url ? <Player url={url} /> : null}
        {!url && !error ? <ActivityIndicator color="#FFFFFF" /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    // Browsers only start a video with sound after a tap on the video itself.
    if (Platform.OS !== 'web') p.play();
  });
  return (
    <VideoView
      player={player}
      style={styles.player}
      contentFit="contain"
      nativeControls
      accessibilityLabel="Workout video"
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  // A browser video only stretches with a width and height, not just its edges.
  player: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  video: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    padding: Spacing.four,
  },
  actions: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
});
