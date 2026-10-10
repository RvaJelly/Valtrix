import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

import { VideoViewer } from '@/components/video-viewer';
import { Colors, Radius, Spacing, themed } from '@/constants/theme';
import { saveVideo } from '@/lib/save-video';
import { videoFileName, videoLink } from '@/lib/workout-videos';

const DENIED = 'Voltrix needs permission to add videos to your phone. Allow it in your phone settings, then try again.';

// A workout video from the trainer: watch it full screen, or save it to the phone.
export function PlanVideo({ path, label, title }: { path: string; label: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveVideo(await videoLink(path), videoFileName(title, path));
      setMessage(
        result === 'denied'
          ? { text: DENIED, ok: false }
          : { text: Platform.OS === 'web' ? 'Saved to your downloads' : 'Saved to your phone', ok: true },
      );
    } catch {
      setMessage({ text: 'The video could not be saved. Check your connection and try again.', ok: false });
    }
    setSaving(false);
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${label.toLowerCase()}`}
          onPress={() => setPlaying(true)}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.7 }]}>
          <View style={styles.playIcon}>
            <Ionicons name="play" size={18} color={Colors.onAccent} />
          </View>
          <Text style={styles.label}>{label}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Save ${label.toLowerCase()} to phone`}
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [styles.save, pressed && { backgroundColor: Colors.surfaceRaised }]}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Ionicons name="download-outline" size={18} color={Colors.accentText} />
          )}
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save to phone'}</Text>
        </Pressable>
      </View>
      {message ? (
        <View style={styles.message}>
          {message.ok ? <Ionicons name="checkmark-circle" size={16} color={Colors.accentText} /> : null}
          <Text style={[styles.messageText, !message.ok && { color: Colors.danger }]}>{message.text}</Text>
        </View>
      ) : null}
      <VideoViewer path={playing ? path : null} title={title} onClose={() => setPlaying(false)} />
    </View>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
    flexShrink: 1,
    color: Colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveText: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  messageText: {
    flex: 1,
    color: Colors.accentText,
    fontSize: 13,
    fontWeight: '600',
  },
}));
