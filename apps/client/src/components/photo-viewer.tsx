import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { Radius, Spacing, themed } from '@/constants/theme';
import { dayMonth } from '@/lib/days';
import { freshPhotoUrl, POSES, type ProgressPhoto } from '@/lib/progress';

type PhotoViewerProps = {
  // Null closes the viewer.
  photo: ProgressPhoto | null;
  onClose: () => void;
  onReplace?: (photo: ProgressPhoto) => void;
  onDelete?: (photo: ProgressPhoto) => void;
  busy?: boolean;
};

// One progress photo full screen, with Replace and Delete when they are the person's own.
export function PhotoViewer({ photo, onClose, onReplace, onDelete, busy }: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  // The link for the photo shown; a fresh one when the kept one is getting old.
  const [link, setLink] = useState<{ path: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    let alive = true;
    freshPhotoUrl(photo.path).then(
      (signed) => {
        if (alive) setLink({ path: photo.path, url: signed.url });
      },
      () => {
        if (alive) setFailed(photo.path);
      },
    );
    return () => {
      alive = false;
    };
  }, [photo]);

  const pose = POSES.find((p) => p.key === photo?.pose)?.label ?? '';
  const url = photo && link?.path === photo.path ? link.url : null;
  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onClose} transparent={false}>
      <View
        style={[styles.wrap, { paddingTop: insets.top + Spacing.two, paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.top}>
          <Text style={styles.title}>{photo ? `${pose} · ${dayMonth(photo.day)}` : ''}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            hitSlop={8}
            style={styles.close}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={styles.photo}>
          {url && photo ? (
            <Image
              source={{ uri: url, cacheKey: photo.path }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              accessibilityLabel={`${pose} photo, ${dayMonth(photo.day)}`}
            />
          ) : failed === photo?.path ? (
            <Text style={styles.failed}>The photo could not be loaded. Check your connection.</Text>
          ) : (
            <ActivityIndicator color="#FFFFFF" />
          )}
        </View>
        {photo && (onReplace || onDelete) ? (
          <View style={styles.actions}>
            {onReplace ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onReplace(photo)}
                disabled={busy}
                style={({ pressed }) => [styles.action, (pressed || busy) && { opacity: 0.6 }]}>
                <Ionicons name="camera-reverse-outline" size={20} color="#FFFFFF" />
                <Text style={styles.actionText}>Replace</Text>
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => onDelete(photo)}
                disabled={busy}
                style={({ pressed }) => [styles.action, (pressed || busy) && { opacity: 0.6 }]}>
                <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                <Text style={[styles.actionText, { color: '#FF6B6B' }]}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = themed(() => ({
  wrap: {
    flex: 1,
    gap: Spacing.three,
    backgroundColor: '#000000',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  title: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  close: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failed: {
    color: '#FFFFFF',
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: Spacing.four,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
}));
