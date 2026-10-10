import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, View } from 'react-native';

import { Button, ErrorText, IconButton, Text } from '@/components/ui';
import { VideoViewer } from '@/components/video-viewer';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import {
  pickWorkoutVideo,
  removeWorkoutVideos,
  uploadWorkoutVideo,
  VIDEO_HINT,
  VIDEO_TIP,
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
    Alert.alert('Add a video', VIDEO_TIP, [
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
  const [busy, setBusy] = useState<'preparing' | 'uploading' | 'removing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const shown = path ?? fallback?.path ?? null;

  async function add() {
    const userId = session?.user.id;
    if (!userId || busy) return;
    setError(null);
    const from = await askSource();
    if (!from) return;
    // A phone can take a while to get a chosen video ready after the picker closes.
    // (A browser's file chooser may never say it was closed, so not there.)
    if (Platform.OS !== 'web') setBusy('preparing');
    try {
      const video = await pickWorkoutVideo(from);
      if (!video) {
        setBusy(null);
        return;
      }
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
      {busy === 'preparing' || busy === 'uploading' ? (
        <View style={styles.row}>
          <View style={styles.icon}>
            <ActivityIndicator color={Colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="rowTitle">{busy === 'preparing' ? 'Getting the video ready…' : 'Uploading video…'}</Text>
            <Text variant="footnote" tone="secondary">
              Keep Voltrix Coach open until it&apos;s done.
            </Text>
          </View>
        </View>
      ) : shown ? (
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Play ${label.toLowerCase()}`}
            onPress={() => setPlaying(shown)}
            style={[styles.play, pointer]}>
            {({ pressed }) => (
              <>
                <View style={[styles.icon, pressed && { backgroundColor: Colors.tintPressed }]}>
                  <Ionicons name="play" size={18} color={Colors.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="rowTitle" numberOfLines={1}>
                    {label}
                  </Text>
                  <Text variant="footnote" tone="secondary" numberOfLines={1}>
                    {path ? 'Tap to play' : fallback?.note}
                  </Text>
                </View>
              </>
            )}
          </Pressable>
          {path ? (
            <Button title="Replace" accessibilityLabel="Replace video" variant="secondary" size="small" onPress={add} />
          ) : (
            // Only the fallback (the exercise's own demo) shows: this adds one for here, and
            // leaves the exercise's video as it is.
            <Button
              title="Use another"
              accessibilityLabel="Add a video for this workout"
              variant="secondary"
              size="small"
              onPress={add}
            />
          )}
          {path ? (
            <IconButton
              icon="trash-outline"
              tone="secondary"
              label="Remove video"
              onPress={remove}
              disabled={busy === 'removing'}
            />
          ) : null}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add video"
          onPress={add}
          style={[styles.row, pointer]}>
          {({ pressed }) => (
            <>
              <View style={[styles.icon, pressed && { backgroundColor: Colors.tintPressed }]}>
                <Ionicons name="videocam-outline" size={20} color={Colors.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {label}
                </Text>
                <Text variant="footnote" tone="secondary">
                  Add a video, {VIDEO_HINT}
                </Text>
              </View>
              <Ionicons name="add" size={20} color={Colors.textSecondary} />
            </>
          )}
        </Pressable>
      )}
      <ErrorText>{error}</ErrorText>
      <VideoViewer path={playing} title={title ?? label} onClose={() => setPlaying(null)} />
    </View>
  );
}

const pointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as const) : null;

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 56,
  },
  play: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 44,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
}));
