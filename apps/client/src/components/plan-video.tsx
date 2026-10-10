import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';

import { Text } from '@/components/ui';
import { VideoViewer } from '@/components/video-viewer';
import { Colors, Fonts, Radius, Spacing, themed } from '@/constants/theme';
import { haptic } from '@/lib/haptics';
import { saveVideo } from '@/lib/save-video';
import { videoFileName, videoLink } from '@/lib/workout-videos';

const DENIED = 'Voltrix needs permission to add videos to your phone. Allow it in your phone settings, then try again.';

// A workout video from the trainer: watch it full screen, or save it to the phone. Quiet on
// purpose: the screen's one orange button is Start.
export function PlanVideo({ path, label, title }: { path: string; label: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  // In a narrow column (an exercise row) Save shows as its icon only, so the label keeps one line.
  const [narrow, setNarrow] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await saveVideo(await videoLink(path), videoFileName(title, path));
      if (result === 'denied') setMessage({ text: DENIED, ok: false });
      else {
        haptic.success();
        setMessage({ text: Platform.OS === 'web' ? 'Saved to your downloads' : 'Saved to your phone', ok: true });
      }
    } catch {
      setMessage({ text: 'The video could not be saved. Check your connection and try again.', ok: false });
    }
    setSaving(false);
  }

  return (
    <View style={{ gap: Spacing.two }}>
      <View style={styles.row} onLayout={(e) => setNarrow(e.nativeEvent.layout.width < 300)}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Play ${label.toLowerCase()}`}
          onPress={() => {
            haptic.tap();
            setPlaying(true);
          }}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.7 }]}>
          <View style={styles.playIcon}>
            <Ionicons name="play" size={16} color={Colors.text} style={{ marginLeft: 2 }} />
          </View>
          <Text variant="callout" numberOfLines={2} style={{ flexShrink: 1, fontFamily: Fonts.textMedium }}>
            {label}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Save ${label.toLowerCase()} to phone`}
          onPress={save}
          disabled={saving}
          style={({ pressed }) => [
            styles.save,
            narrow && styles.saveIcon,
            pressed && { backgroundColor: Colors.tint },
          ]}>
          {saving ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Ionicons name="download-outline" size={18} color={Colors.textSecondary} />
          )}
          {narrow ? null : (
            <Text variant="footnote" tone="secondary">
              {saving ? 'Saving…' : 'Save to phone'}
            </Text>
          )}
        </Pressable>
      </View>
      {message ? (
        <View style={styles.message}>
          <Ionicons
            name={message.ok ? 'checkmark-circle' : 'alert-circle-outline'}
            size={16}
            color={message.ok ? Colors.success : Colors.danger}
          />
          <Text variant="footnote" tone={message.ok ? 'success' : 'danger'} style={{ flex: 1 }}>
            {message.text}
          </Text>
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
    gap: Spacing.tight,
    minHeight: 44,
  },
  playIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.tint,
  },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
    paddingHorizontal: Spacing.tight,
    borderRadius: Radius.medium,
  },
  saveIcon: {
    width: 44,
    paddingHorizontal: 0,
    justifyContent: 'center',
    borderRadius: 22,
  },
  message: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
}));
