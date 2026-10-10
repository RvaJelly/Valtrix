import { useState } from 'react';
import { View } from 'react-native';

import { Chips } from '@/components/chips';
import { DayPickSheet } from '@/components/day-pick-sheet';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Group, IconTile, ListRow, Text } from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { dayMonth } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { refreshReminders } from '@/lib/reminders';
import { untilDay, weekdayName } from '@/lib/repeat-rules';
import { removeSessions, setRepeatEnd, type Repeat } from '@/lib/repeats';
import { supabase } from '@/lib/supabase';
import { addDaysKey, dayFromKey, zonedParts } from '@/lib/zones';

// No end first. The week keys start with a letter: number-like keys would come first in the chips.
const UNTIL: Record<string, string> = {
  none: 'No end',
  w4: '4 weeks',
  w8: '8 weeks',
  w12: '12 weeks',
  pick: 'Pick a day',
};

// "until 8 December", "no end".
export function repeatEnd(r: Pick<Repeat, 'ends_on'>) {
  return r.ends_on ? `until ${dayMonth(dayFromKey(r.ends_on))}` : 'no end';
}

// A repeat booking from one of its sessions: change this and later ones, when it ends, or stop it.
export function RepeatSheet({
  visible,
  repeat,
  first,
  onClose,
  onChangeLater,
  onStop,
  onEnded,
}: {
  visible: boolean;
  repeat: Repeat | null;
  // The client's first name, or the blocked time's title.
  first: string;
  onClose: () => void;
  onChangeLater: () => void;
  onStop: () => void;
  // The repeat's end changed (and maybe sessions went): the page reloads.
  onEnded: (endsOn: string | null) => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<'main' | 'until'>('main');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStep('main');
      setError(null);
    }
  }
  if (!repeat) return <Sheet visible={false} onClose={onClose} />;
  const r = repeat;
  const time = r.start_time.slice(0, 5);

  // Sets the last day; booked sessions after it are named in a confirm first, then removed.
  async function setEnd(last: string | null) {
    if (busy) return;
    setError(null);
    if (last) {
      const { data, error: failure } = await supabase
        .from('sessions')
        .select('id, starts_at')
        .eq('series_id', r.id)
        .eq('status', 'scheduled');
      if (failure) return setError(plainError(failure));
      const after = ((data ?? []) as { starts_at: string }[]).filter(
        (s) => zonedParts(new Date(s.starts_at), r.time_zone).day > last,
      ).length;
      if (after) {
        const ok = await confirm(
          after === 1 ? 'Remove 1 booked session?' : `Remove ${after} booked sessions?`,
          `Booked sessions after ${dayMonth(dayFromKey(last))} are removed, and ${first} sees the change in Voltrix.`,
          'Remove',
        );
        if (!ok) return;
      }
    }
    setBusy(true);
    let ids: string[];
    try {
      ids = await setRepeatEnd(r.id, last);
    } catch (e) {
      setBusy(false);
      haptic.warning();
      return setError(plainError(e, 'Couldn’t change it. Try again.'));
    }
    const ends = last ? `Repeat ends ${dayMonth(dayFromKey(last))}.` : 'The repeat has no end now.';
    try {
      await removeSessions(ids);
      haptic.success();
      toast(ids.length ? `${ends} ${ids.length === 1 ? '1 session' : `${ids.length} sessions`} removed.` : ends);
    } catch {
      haptic.warning();
      toast(`${ends} ${ids.length === 1 ? '1 booked session is' : `${ids.length} booked sessions are`} still there.`, {
        action: {
          label: 'Try again',
          onPress: () =>
            removeSessions(ids).then(
              () => onEnded(last),
              () => {},
            ),
        },
      });
    }
    if (ids.length) refreshReminders();
    setBusy(false);
    onEnded(last);
    onClose();
  }

  function chooseUntil(v: string | null) {
    if (!v) return;
    if (v === 'pick') return setPicking(true);
    setEnd(v === 'none' ? null : untilDay(r.starts_on, Number(v.slice(1))));
  }

  const untilKey = r.ends_on == null ? 'none' : 'pick';
  return (
    <Sheet visible={visible} onClose={onClose} title={`Every ${weekdayName(r.weekday)} at ${time}`}>
      <Text variant="callout" tone="secondary" style={{ marginTop: -Spacing.two }}>
        {`From ${dayMonth(dayFromKey(r.starts_on))} · ${repeatEnd(r)}`}
      </Text>
      {step === 'main' ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          <ListRow
            title="Change this and later…"
            leading={<IconTile icon="create-outline" />}
            onPress={onChangeLater}
            testID="repeat-change"
          />
          <ListRow
            title="Until"
            leading={<IconTile icon="calendar-outline" />}
            trailing={
              <Text variant="callout" tone="secondary" style={Tabular}>
                {r.ends_on ? dayMonth(dayFromKey(r.ends_on)) : 'No end'}
              </Text>
            }
            onPress={() => setStep('until')}
            testID="repeat-until"
          />
          <ListRow
            title="Stop repeating from here"
            titleTone="danger"
            leading={<IconTile icon="stop-circle-outline" color={Colors.danger} />}
            chevron={false}
            onPress={onStop}
            testID="repeat-stop"
            last
          />
        </Group>
      ) : (
        <View style={{ gap: Spacing.three }}>
          <Text variant="label" tone="secondary">
            Until
          </Text>
          <Chips
            options={r.ends_on ? { ...UNTIL, pick: dayMonth(dayFromKey(r.ends_on)) } : UNTIL}
            value={untilKey}
            onChange={chooseUntil}
            wrap
            testIDPrefix="repeat-until-"
          />
          <Text variant="footnote" tone="secondary">
            Weeks count from the first session. With no end, Voltrix keeps booking 12 weeks ahead.
          </Text>
          <Button title="Back" variant="ghost" onPress={() => setStep('main')} disabled={busy} />
        </View>
      )}
      <ErrorText>{error}</ErrorText>
      <DayPickSheet
        visible={picking}
        title="Last day"
        from={r.starts_on}
        to={addDaysKey(r.starts_on, 365)}
        value={r.ends_on}
        onPick={(d) => {
          setPicking(false);
          setEnd(d);
        }}
        onClose={() => setPicking(false)}
      />
    </Sheet>
  );
}
