import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';

import { VideoViewer } from '@/components/video-viewer';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import {
  MAX_VIDEO_MINUTES,
  pickWorkoutVideo,
  removeWorkoutVideos,
  uploadWorkoutVideo,
  VideoError,
} from '@/lib/workout-videos';

type Props = {
  // What the video is called here, like "Demo video" or "Workout video".
  label: string;
  path: string | null;
  // Saves the new video (or null to remove it). Returns a message when that didn't work.
  onChange: (path: string | null) => Promise<string | null>;
  // A video that shows while this one is empty, like the exercise's own demo.
  fallback?: { path: string; note: string } | null;
  // Name for the full-screen player.
  title?: string;
};

// Ask where the video comes from. Browsers only have "choose a file".
function askSource(): Promise<'camera' | 'library' | null> {
  if (Platform.OS === 'web') return Promise.resolve('library');
  return new Promise((resolve) =>
    Alert.alert('Add a video', `Up to ${MAX_VIDEO_MINUTES} minutes.`, [
      { text: 'Record a video', onPress: () => resolve('camera') },
      { text: 'Choose from your phone', onPress: () => resolve('library') },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]),
  );
}

// Add, play, replace or remove one workout video. Clients with the workout in their
// plan can watch it in the Voltrix app and save it to their phone.
export function WorkoutVideo({ label, path, onChange, fallback, title }: Props) {
  const { session } = useAuth();
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const shown = path ?? fallback?.path ?? null;

  async function add() {
    const userId = session?.user.id;
    if (!userId || busy) return;
    setError(null);
    const from = await askSource();
    if (!from) return;
    try {
      const video = await pickWorkoutVideo(from);
      if (!video) return;
      setBusy('uploading');
      const uploaded = await uploadWorkoutVideo(userId, video);
      const problem = await onChange(uploaded);
      if (problem) {
        await removeWorkoutVideos([uploaded]);
        setError(problem);
      } else {
        // The old video isn't used any more.
        await removeWorkoutVideos([path]);
      }
    } catch (e) {
      setError(e instanceof VideoError ? e.message : 'Could not add that video. Try another one.');
    }
    setBusy(null);
  }

  async function remove() {
    if (!path || busy) return;
    if (!(await confirm('Remove video?', 'Your clients won’t see it any more.', 'Remove'))) return;
    setError(null);
    setBusy('removing');
    const problem = await onChange(null);
    if (problem) setError(problem);
    else await removeWorkoutVideos([path]);
    setBusy(null);
  }

  return (
    <View style={{ gap: Spacing.two }}>
      {busy === 'uploading' ? (
        <View style={styles.row}>
          <ActivityIndicator color={Colors.accentText} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Uploading video…</Text>
            <Text style={styles.note}>Keep Voltrix Coach open until it&apos;s done.</Text>
          </View>
        </View>
      ) : shown ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${label.toLowerCase()}`}
            onPress={() => setPlaying(shown)}
            style={({ pressed }) => [styles.play, pressed && { opacity: 0.7 }]}>
            <View style={styles.playIcon}>
              <Ionicons name="play" size={18} color={Colors.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.note} numberOfLines={1}>
                {path ? 'Tap to play' : fallback?.note}
              </Text>
            </View>
          </Pressable>
          <SmallButton label="Replace" accessibilityLabel="Replace video" onPress={add} />
          {path ? (
            <SmallButton
              label="Remove"
              accessibilityLabel="Remove video"
              onPress={remove}
              danger
              loading={busy === 'removing'}
            />
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add video"
          onPress={add}
          style={({ pressed }) => [styles.row, styles.add, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          <Ionicons name="videocam-outline" size={22} color={Colors.accentText} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: Colors.accentText }]}>Add video</Text>
            <Text style={styles.note}>
              {label}, up to {MAX_VIDEO_MINUTES} minutes
            </Text>
          </View>
        </Pressable>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <VideoViewer path={playing} title={title ?? label} onClose={() => setPlaying(null)} />
    </View>
  );
}

function SmallButton({
  label,
  accessibilityLabel,
  onPress,
  danger,
  loading,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={loading}
      hitSlop={4}
      style={({ pressed }) => [styles.small, pressed && { backgroundColor: Colors.surfaceRaised }]}>
      {loading ? (
        <ActivityIndicator size="small" color={Colors.text} />
      ) : (
        <Text style={[styles.smallText, danger && { color: Colors.danger }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
  },
  add: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    gap: Spacing.three,
  },
  play: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  playIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
  },
  label: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  note: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  small: {
    minHeight: 36,
    minWidth: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: Colors.danger,
    fontSize: 14,
  },
}));
