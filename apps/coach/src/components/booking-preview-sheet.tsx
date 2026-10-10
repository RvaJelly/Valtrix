import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/chips';
import { Sheet } from '@/components/sheet';
import { Notice, Skeleton, Text } from '@/components/ui';
import { Colors, Fonts, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { previewTimes } from '@/lib/booking-rules';
import { longDate } from '@/lib/format';
import { durationWords } from '@/lib/hours';
import { dayFromKey, zonedParts } from '@/lib/zones';

type Slot = { starts_at: string; local_day: string; local_time: string };

// What clients see: the open times of the next 7 days from the saved rules, by day, as the time
// pills clients tap (here only to look at). Works with booking off.
export function BookingPreviewSheet({
  visible,
  onClose,
  lengths,
  notice,
  zone,
  unsaved,
}: {
  visible: boolean;
  onClose: () => void;
  // The saved rules: the page's unsaved changes aren't in the preview.
  lengths: number[];
  notice: number;
  zone: string;
  unsaved: boolean;
}) {
  const [length, setLength] = useState(lengths[0] ?? 60);
  // The answer for one length and try, so another length's times never show while this one loads.
  const [loaded, setLoaded] = useState<{ key: string; slots: Slot[] | 'failed' } | null>(null);
  const [tries, setTries] = useState(0);
  const minutes = lengths.includes(length) ? length : (lengths[0] ?? 60);
  const key = `${minutes}-${zone}-${tries}`;
  const answer = loaded?.key === key ? loaded.slots : null;
  const slots = answer === 'failed' ? null : answer;
  const failed = answer === 'failed';

  useEffect(() => {
    if (!visible) return;
    let live = true;
    previewTimes(zonedParts(new Date(), zone).day, 7, minutes).then(
      (found) => live && setLoaded({ key, slots: found }),
      () => live && setLoaded({ key, slots: 'failed' }),
    );
    return () => {
      live = false;
    };
  }, [key, minutes, visible, zone]);

  // A new key: the effect above reads again (and shows the skeleton meanwhile).
  function retry() {
    setTries((t) => t + 1);
  }

  const days: { day: string; times: string[] }[] = [];
  for (const s of slots ?? []) {
    const last = days[days.length - 1];
    if (last && last.day === s.local_day) last.times.push(s.local_time.slice(0, 5));
    else days.push({ day: s.local_day, times: [s.local_time.slice(0, 5)] });
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="What clients see">
      {unsaved ? (
        <Notice tone="warning" onCard>
          Save to see your changes.
        </Notice>
      ) : null}
      {lengths.length > 1 ? (
        <Chips
          options={Object.fromEntries(lengths.map((m) => [String(m), `${m} min`]))}
          value={String(minutes)}
          onChange={(v) => v && setLength(Number(v))}
          background={Colors.surfaceHigh}
          testIDPrefix="preview-length-"
        />
      ) : null}
      {failed ? (
        <Notice tone="danger" onCard action={{ label: 'Try again', onPress: retry }}>
          The times couldn’t be loaded.
        </Notice>
      ) : !slots ? (
        <View style={{ gap: Spacing.three }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ gap: Spacing.two }}>
              <Skeleton width={140} height={14} />
              <Skeleton width="80%" height={36} radius={Radius.pill} />
            </View>
          ))}
        </View>
      ) : days.length ? (
        <View style={{ gap: Spacing.gutter }} testID="booking-preview-list">
          {days.map((d) => (
            <View key={d.day} style={{ gap: Spacing.two }}>
              <Text variant="label" tone="secondary" accessibilityRole="header">
                {longDate(dayFromKey(d.day))}
              </Text>
              <View style={styles.pills}>
                {d.times.map((t) => (
                  <View key={t} style={styles.pill} accessibilityRole="text">
                    <Text variant="callout" style={[Tabular, { fontFamily: Fonts.textMedium }]}>
                      {t}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text variant="body" tone="secondary" testID="booking-preview-empty">
          No open times in the next 7 days. Add your hours first.
        </Text>
      )}
      <Text variant="footnote" tone="secondary">
        {notice > 0
          ? `Times you’re booked, with your gap around them, and times sooner than ${durationWords(notice)} from now aren’t shown.`
          : 'Times you’re booked, with your gap around them, aren’t shown.'}
      </Text>
    </Sheet>
  );
}

const styles = themed(() => ({
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
}));
