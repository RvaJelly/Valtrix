import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { BookingPreviewSheet } from '@/components/booking-preview-sheet';
import { Chips } from '@/components/chips';
import { HoursSheet } from '@/components/hours-sheet';
import { LengthsSheet } from '@/components/lengths-sheet';
import { SettingsPage } from '@/components/settings-parts';
import { Sheet } from '@/components/sheet';
import { Stepper } from '@/components/stepper';
import { StickyFooter } from '@/components/sticky-footer';
import { TimeZoneSheet } from '@/components/time-zone-sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  Divider,
  ErrorText,
  Group,
  ListRow,
  Notice,
  Section,
  Segmented,
  SkeletonRows,
  Text,
  TextField,
  useDelayed,
} from '@/components/ui';
import { Spacing, Tabular } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { DEFAULT_RULES, loadRules, saveRules, type BookingRules, type HoursRange } from '@/lib/booking-rules';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { dayHours, durationWords, hoursProblem, normaliseHours } from '@/lib/hours';
import { useLeaveGuard } from '@/lib/leave-guard';
import { weekdayName } from '@/lib/repeat-rules';
import { supabase } from '@/lib/supabase';
import { HOME_ZONE, zoneCity } from '@/lib/zones';

type Mode = 'off' | 'approve' | 'auto';
type Picker = 'lengths' | 'notice' | 'horizon' | 'gap' | 'cancel' | 'place' | 'zone' | 'preview';
type Day = HoursRange['day'];

const DAYS: Day[] = [1, 2, 3, 4, 5, 6, 7];

const MODE_NOTES: Record<Mode, string> = {
  off: 'Clients message you to book.',
  approve: 'Requests wait on Home until you approve them.',
  auto: 'Bookings go straight into your calendar.',
};

const NOTICE: Record<string, string> = {
  '0': 'No notice',
  '60': '1 hour',
  '120': '2 hours',
  '720': '12 hours',
  '1440': '1 day',
  '2880': '2 days',
};
const HORIZON: Record<string, string> = {
  '7': '1 week',
  '14': '2 weeks',
  '28': '4 weeks',
  '56': '8 weeks',
  '84': '12 weeks',
};
const GAP: Record<string, string> = { '0': 'None', '10': '10 min', '15': '15 min', '30': '30 min' };
const CANCEL: Record<string, string> = {
  none: 'Not in the app',
  '120': '2 hours',
  '720': '12 hours',
  '1440': '1 day',
  '2880': '2 days',
};
const STEPS = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
] as const;

// A saved value that isn't one of the choices still shows, as itself.
function withValue(options: Record<string, string>, key: string, label: string) {
  return key in options ? options : { ...options, [key]: label };
}

const horizonWords = (days: number) => (days % 7 === 0 ? durationWords(days * 1440) : `${days} days`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Settings › Online booking: whether clients you train can book your open times in Voltrix, your
// weekly hours, and the rules for what they can book. Saved together with the button at the bottom.
export default function OnlineBooking() {
  const { profile, refreshProfile } = useAuth();
  const toast = useToast();
  const savedZone = profile?.time_zone || HOME_ZONE;
  const [saved, setSaved] = useState<BookingRules | null>(null);
  const [draft, setDraft] = useState<BookingRules>(DEFAULT_RULES);
  const [zone, setZone] = useState(savedZone);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [hoursDay, setHoursDay] = useState<Day | null>(null);
  const [place, setPlace] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = useDelayed(300);
  const loads = useRef(0);

  const changed = !!saved && (!same(draft, saved) || zone !== savedZone);
  useLeaveGuard(changed && !saving);

  const load = useCallback(() => {
    const id = ++loads.current;
    return loadRules().then(
      (rules) => {
        if (id !== loads.current) return;
        const tidy = { ...rules, hours: normaliseHours(rules.hours) };
        setSaved(tidy);
        setDraft(tidy);
        setFailed(false);
      },
      () => {
        if (id === loads.current) setFailed(true);
      },
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  function set(patch: Partial<BookingRules>) {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  }

  function chooseMode(mode: Mode) {
    if (mode === 'off') set({ enabled: false });
    else set({ enabled: true, mode });
  }

  // ---------- Hours ----------

  const dayRanges = (day: Day | null) =>
    day ? draft.hours.filter((r) => r.day === day).map(({ from, to }) => ({ from, to })) : [];

  function setDayRanges(day: Day, ranges: { from: string; to: string }[]) {
    set({ hours: [...draft.hours.filter((r) => r.day !== day), ...ranges.map((r) => ({ day, ...r }))] });
  }

  function closeHours() {
    setHoursDay(null);
    // Sorted, and touching ones joined, once the day is done.
    setDraft((d) => ({ ...d, hours: normaliseHours(d.hours) }));
  }

  function copyToWeekdays() {
    if (!hoursDay) return;
    const ranges = dayRanges(hoursDay);
    const others = draft.hours.filter((r) => r.day > 5);
    const weekdays = ([1, 2, 3, 4, 5] as Day[]).flatMap((day) => ranges.map((r) => ({ day, ...r })));
    set({ hours: [...others, ...weekdays] });
    haptic.success();
    toast('Copied to Monday to Friday');
  }

  // ---------- Save ----------

  async function save() {
    if (!profile || !saved || saving) return;
    setError(null);
    const problem = hoursProblem(draft.hours);
    if (problem) {
      haptic.warning();
      return setError(problem);
    }
    if (draft.enabled && !draft.hours.length) {
      const add = await confirm(
        'Add your hours first?',
        'Clients can’t see any times until you add your hours.',
        'Add hours',
      );
      if (add) return setHoursDay(1);
    }
    setSaving(true);
    if (zone !== savedZone) {
      const { error: failure } = await supabase.from('profiles').update({ time_zone: zone }).eq('id', profile.id);
      if (failure) {
        setSaving(false);
        haptic.warning();
        return setError(
          failure.code === '23514' || failure.code === '22023'
            ? 'That time zone isn’t known. Pick one from the list.'
            : plainError(failure, 'Couldn’t save. Try again.'),
        );
      }
      await refreshProfile();
    }
    const rules = { ...draft, hours: normaliseHours(draft.hours), location: draft.location?.trim() || null };
    try {
      await saveRules(rules);
    } catch (e) {
      setSaving(false);
      haptic.warning();
      const text = String((e as { message?: unknown })?.message ?? '');
      return setError(
        text.includes('location_check')
          ? 'Some of that is too long. Shorten it and try again.'
          : text.includes('hours_check')
            ? 'Check your hours and try again.'
            : plainError(e, 'Couldn’t save. Try again.'),
      );
    }
    haptic.success();
    setSaved(rules);
    setDraft(rules);
    setSaving(false);
    toast('Saved');
  }

  // ---------- Page ----------

  if (failed && !saved)
    return (
      <SettingsPage>
        <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
          Your booking settings couldn’t be loaded.
        </Notice>
      </SettingsPage>
    );
  if (!saved) return <SettingsPage>{showSkeleton ? <SkeletonRows count={8} /> : null}</SettingsPage>;

  const mode: Mode = draft.enabled ? draft.mode : 'off';
  const dim = draft.enabled ? null : { opacity: 0.55 };
  const cancelKey = draft.cancel_minutes == null ? 'none' : String(draft.cancel_minutes);
  const trailing = (text: string, lines = 2) => (
    <Text variant="callout" tone="secondary" numberOfLines={lines} style={[Tabular, { textAlign: 'right' }]}>
      {text}
    </Text>
  );

  return (
    <SettingsPage
      footer={
        <StickyFooter>
          <ErrorText>{error}</ErrorText>
          <Button title="Save" onPress={save} loading={saving} disabled={!changed} testID="booking-save" />
        </StickyFooter>
      }>
      <View style={{ gap: Spacing.tight }}>
        <Segmented
          options={[
            { value: 'off', label: 'Off' },
            { value: 'approve', label: 'Ask me first' },
            { value: 'auto', label: 'Instant' },
          ]}
          value={mode}
          onChange={chooseMode}
          testID="booking-mode"
        />
        <Text variant="footnote" tone="secondary" testID="booking-mode-note">
          {MODE_NOTES[mode]}
        </Text>
        {draft.enabled ? (
          <Text variant="footnote" tone="secondary">
            Until phone notifications arrive in an update, you see new bookings when you open Voltrix Coach.
          </Text>
        ) : (
          <Text variant="footnote" tone="secondary">
            Clients you train pick a time you’re free in Voltrix. With Ask me first, you approve each one.
          </Text>
        )}
      </View>

      <Section title="Your hours" style={dim}>
        <Group>
          {DAYS.map((day, i) => (
            <ListRow
              key={day}
              title={weekdayName(day)}
              // One stretch of hours a line, so a split day reads as two clean times.
              trailing={trailing(dayHours(draft.hours, day).split(', ').join('\n'), 4)}
              onPress={() => setHoursDay(day)}
              accessibilityLabel={`${weekdayName(day)}: ${dayHours(draft.hours, day)}`}
              testID={`booking-day-${day}`}
              last={i === DAYS.length - 1}
            />
          ))}
        </Group>
        <Text variant="footnote" tone="secondary">
          {`On your clock: ${zoneCity(zone)}. Clients only see times inside these hours that are free in your calendar.`}
        </Text>
      </Section>

      <Section title="Rules" style={dim}>
        <Group>
          <ListRow
            title="Session lengths"
            trailing={trailing(draft.lengths.map((m) => `${m} min`).join(', '))}
            onPress={() => setPicker('lengths')}
            testID="booking-lengths"
          />
          <ListRow
            title="Book at least"
            trailing={trailing(draft.notice_minutes ? `${durationWords(draft.notice_minutes)} ahead` : 'No notice')}
            onPress={() => setPicker('notice')}
            testID="booking-notice"
          />
          <ListRow
            title="Book up to"
            trailing={trailing(`${horizonWords(draft.horizon_days)} ahead`)}
            onPress={() => setPicker('horizon')}
            testID="booking-horizon"
          />
          <View style={{ paddingHorizontal: Spacing.gutter, paddingVertical: Spacing.tight, gap: Spacing.two }}>
            <Text variant="rowTitle">Start times every</Text>
            <Segmented
              options={STEPS}
              value={String(draft.step_minutes) as '15' | '30' | '60'}
              onChange={(v) => set({ step_minutes: Number(v) as 15 | 30 | 60 })}
              testID="booking-step"
            />
          </View>
          <Divider inset={Spacing.gutter} />
          <ListRow
            title="Gap between sessions"
            trailing={trailing(draft.buffer_minutes ? `${draft.buffer_minutes} min` : 'None')}
            onPress={() => setPicker('gap')}
            testID="booking-gap"
          />
          <ListRow
            title="Cancel in the app"
            trailing={trailing(
              draft.cancel_minutes == null
                ? 'Not in the app'
                : draft.cancel_minutes === 0
                  ? 'Until it starts'
                  : `Until ${durationWords(draft.cancel_minutes)} before`,
            )}
            onPress={() => setPicker('cancel')}
            testID="booking-cancel"
          />
          <View style={{ paddingHorizontal: Spacing.gutter, paddingVertical: Spacing.two }}>
            <Stepper
              label="Sessions a client can hold"
              value={String(draft.max_ahead)}
              spoken={`${draft.max_ahead} booked sessions`}
              onLess={() => set({ max_ahead: Math.max(1, draft.max_ahead - 1) })}
              onMore={() => set({ max_ahead: Math.min(20, draft.max_ahead + 1) })}
              lessDisabled={draft.max_ahead <= 1}
              moreDisabled={draft.max_ahead >= 20}
              testID="booking-hold"
            />
          </View>
          <Divider inset={Spacing.gutter} />
          <ListRow
            title="Place"
            trailing={trailing(draft.location?.trim() || 'Not set')}
            onPress={() => {
              setPlace(draft.location ?? '');
              setPicker('place');
            }}
            testID="booking-place"
          />
          <ListRow
            title="Time zone"
            trailing={trailing(zoneCity(zone))}
            onPress={() => setPicker('zone')}
            testID="booking-zone"
          />
          <ListRow title="What clients see" onPress={() => setPicker('preview')} testID="booking-preview" last />
        </Group>
        <Text variant="footnote" tone="secondary">
          A client can hold this many booked sessions at once. Sessions you book for them don’t count.
        </Text>
      </Section>

      <HoursSheet
        day={hoursDay}
        ranges={dayRanges(hoursDay)}
        onChange={(ranges) => hoursDay && setDayRanges(hoursDay, ranges)}
        onCopy={copyToWeekdays}
        onClose={closeHours}
      />
      <LengthsSheet
        visible={picker === 'lengths'}
        lengths={draft.lengths}
        onChange={(lengths) => set({ lengths })}
        onClose={() => setPicker(null)}
      />
      <ChoiceSheet
        visible={picker === 'notice'}
        title="Book at least"
        options={withValue(NOTICE, String(draft.notice_minutes), durationWords(draft.notice_minutes))}
        value={String(draft.notice_minutes)}
        onChoose={(v) => set({ notice_minutes: Number(v) })}
        onClose={() => setPicker(null)}
        note="How long before a session clients can still book it."
        testIDPrefix="notice-"
      />
      <ChoiceSheet
        visible={picker === 'horizon'}
        title="Book up to"
        options={withValue(HORIZON, String(draft.horizon_days), horizonWords(draft.horizon_days))}
        value={String(draft.horizon_days)}
        onChoose={(v) => set({ horizon_days: Number(v) })}
        onClose={() => setPicker(null)}
        note="How far ahead clients can see your open times."
        testIDPrefix="horizon-"
      />
      <ChoiceSheet
        visible={picker === 'gap'}
        title="Gap between sessions"
        options={withValue(GAP, String(draft.buffer_minutes), `${draft.buffer_minutes} min`)}
        value={String(draft.buffer_minutes)}
        onChoose={(v) => set({ buffer_minutes: Number(v) })}
        onClose={() => setPicker(null)}
        note="Time kept free before and after each session, for travel or a breather."
        testIDPrefix="gap-"
      />
      <ChoiceSheet
        visible={picker === 'cancel'}
        title="Cancel in the app"
        options={withValue(CANCEL, cancelKey, durationWords(draft.cancel_minutes ?? 0))}
        value={cancelKey}
        onChoose={(v) => set({ cancel_minutes: v === 'none' ? null : Number(v) })}
        onClose={() => setPicker(null)}
        note="Until when clients can cancel a session themselves. After that they message you."
        testIDPrefix="cancel-"
      />
      <Sheet visible={picker === 'place'} onClose={() => setPicker(null)} title="Place">
        <TextField
          label="Where you train"
          optional
          value={place}
          onChangeText={setPlace}
          maxLength={200}
          autoCapitalize="words"
          placeholder="For example: Sea Point Gym"
          enterKeyHint="done"
          onSubmitEditing={() => {
            set({ location: place.trim() || null });
            setPicker(null);
          }}
          testID="booking-place-field"
        />
        <Text variant="footnote" tone="secondary">
          Sessions clients book get this place. You can change it on any session.
        </Text>
        <Button
          title="Done"
          variant="secondary"
          onPress={() => {
            set({ location: place.trim() || null });
            setPicker(null);
          }}
          testID="booking-place-done"
        />
      </Sheet>
      <TimeZoneSheet
        visible={picker === 'zone'}
        value={zone}
        onChoose={(z) => {
          setError(null);
          setZone(z);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <BookingPreviewSheet
        visible={picker === 'preview'}
        onClose={() => setPicker(null)}
        lengths={saved.lengths}
        notice={saved.notice_minutes}
        zone={savedZone}
        unsaved={changed}
      />
    </SettingsPage>
  );
}

function ChoiceSheet({
  visible,
  title,
  options,
  value,
  onChoose,
  onClose,
  note,
  testIDPrefix,
}: {
  visible: boolean;
  title: string;
  options: Record<string, string>;
  value: string;
  onChoose: (value: string) => void;
  onClose: () => void;
  note: string;
  testIDPrefix: string;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Chips
        options={options}
        value={value}
        onChange={(v) => {
          if (v) onChoose(v);
          onClose();
        }}
        wrap
        testIDPrefix={testIDPrefix}
      />
      <Text variant="footnote" tone="secondary">
        {note}
      </Text>
    </Sheet>
  );
}
