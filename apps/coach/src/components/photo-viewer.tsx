import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { dayMonth } from '@/lib/days';
import { freshPhotoUrl, POSES, type ProgressPhoto } from '@/lib/progress';

type Props = {
  // The photo to show; null keeps the viewer closed.
  photo: ProgressPhoto | null;
  // The client's first name, for the title and the screen reader.
  name: string;
  onClose: () => void;
};

// A client's progress photo full screen, on black like the videos. The link is signed again
// when the one kept is old, and the photo is kept in memory only, never on the phone's
// storage, so a client's body photos don't stay behind on the trainer's phone.
export function PhotoViewer({ photo, name, onClose }: Props) {
  return (
    <Modal
      visible={!!photo}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}>
      {/* Black even while it fades away, so closing doesn't flash white. */}
      <View style={styles.screen}>
        {photo ? <ViewerBody key={photo.path} photo={photo} name={name} onClose={onClose} /> : null}
      </View>
    </Modal>
  );
}

function ViewerBody({ photo, name, onClose }: Props & { photo: ProgressPhoto }) {
  const insets = useSafeAreaInsets();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  // Try again: the link is signed afresh, in case the kept one is what failed.
  const [attempt, setAttempt] = useState(0);
  const pose = POSES.find((p) => p.key === photo.pose)?.label ?? 'Photo';
  const title = `${pose} · ${dayMonth(photo.day)}`;

  useEffect(() => {
    let alive = true;
    freshPhotoUrl(photo.path, attempt > 0).then(
      (link) => {
        if (alive) setUrl(link.url);
      },
      () => {
        if (alive) setError(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [photo.path, attempt]);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + Spacing.three }}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close photo"
          hitSlop={12}
          onPress={onClose}
          style={styles.close}>
          <Ionicons name="close" size={30} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.body}>
        {url ? (
          <Image
            source={{ uri: url }}
            cachePolicy="memory"
            contentFit="contain"
            style={styles.image}
            accessible
            accessibilityLabel={`${name}'s ${pose.toLowerCase()} photo, ${dayMonth(photo.day)}`}
            // A dropped connection, or a photo the client has just replaced or removed.
            onError={() => {
              setUrl(null);
              setError(true);
            }}
          />
        ) : null}
        {!url && !error ? <ActivityIndicator color="#FFFFFF" /> : null}
        {error ? (
          <View style={styles.problem}>
            <Text style={styles.error}>Could not load this photo. Check your internet connection and try again.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setError(false);
                setAttempt((a) => a + 1);
              }}
              style={({ pressed }) => [styles.retry, pressed && { opacity: 0.6 }]}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
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
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  close: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  problem: {
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  error: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  retry: {
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
