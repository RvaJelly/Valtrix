import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { SessionForm, type SessionInput } from '@/components/session-form';
import { useToast } from '@/components/toast';
import { Notice, SkeletonRows, useDelayed } from '@/components/ui';
import { Colors, Layout, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { refreshReminders } from '@/lib/reminders';
import { weekdayName } from '@/lib/repeat-rules';
import { bookRepeat } from '@/lib/repeats';
import { addError, addFailure } from '@/lib/save-error';
import { addDays, combine, dayKey, fromDayKey, SESSION_COLUMNS, startOfDay, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { HOME_ZONE, zonedParts } from '@/lib/zones';

type Params = {
  date?: string;
  // `client` from the client page; `clientId` from round 2's links.
  client?: string;
  clientId?: string;
  time?: string;
  duration?: string;
  location?: string;
  online?: string;
  // '1': Repeat every week starts on.
  repeat?: string;
  // A one-off session to repeat every week from the week after it.
  repeatFrom?: string;
};

// Book a session, or the same one every week. `time`, `duration`, `location` and `online` come from
// Book again on a session; `repeatFrom` copies a session for Repeat every week.
export default function NewSession() {
  const goBack = useGoBack();
  const toast = useToast();
  const { profile } = useAuth();
  const params = useLocalSearchParams<Params>();
  const { date, time, duration, location, online, repeat, repeatFrom } = params;
  const clientId = params.client ?? params.clientId;
  const [source, setSource] = useState<Session | null | 'failed'>(null);
  const showSkeleton = useDelayed(300);

  useEffect(() => {
    if (!repeatFrom) return;
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('id', repeatFrom)
      .maybeSingle()
      .then(({ data, error }) => setSource(error || !data ? 'failed' : (data as unknown as Session)));
  }, [repeatFrom]);

  async function submit(input: SessionInput, every: { until: string | null; skip: string[] } | null) {
    if (!every) {
      const { error } = await supabase.from('sessions').insert(input);
      if (error) return addError(error);
      refreshReminders();
      goBack('/calendar');
      return null;
    }
    const start = new Date(input.starts_at);
    try {
      const booked = await bookRepeat({
        clientId: input.client_id,
        title: input.title,
        startsAt: start,
        minutes: input.duration_minutes,
        location: input.location,
        online: input.online,
        notes: input.notes,
        priceCents: input.price_cents ?? null,
        until: every.until,
        skip: every.skip,
      });
      haptic.success();
      const clock = zonedParts(start, profile?.time_zone || HOME_ZONE);
      const when = `${weekdayName(clock.weekday)} at ${clock.time}`;
      let first = input.title ?? '';
      if (input.client_id) {
        const { data } = await supabase.from('clients').select('first_name').eq('id', input.client_id).maybeSingle();
        first = (data as { first_name: string } | null)?.first_name ?? 'your client';
      }
      toast(
        input.client_id
          ? `Booked ${booked.booked === 1 ? '1 session' : `${booked.booked} sessions`} with ${first}, every ${when}.`
          : `Booked ${first} every ${when}.`,
      );
      refreshReminders();
      router.dismissTo({ pathname: '/calendar', params: { date: dayKey(start) } });
      return null;
    } catch (e) {
      return addFailure(e);
    }
  }

  if (repeatFrom) {
    if (source === 'failed')
      return (
        <View style={{ flex: 1, backgroundColor: Colors.background, padding: Spacing.gutter }}>
          <Notice tone="danger">That session couldn’t be found. It may have been removed.</Notice>
        </View>
      );
    if (!source)
      return (
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ width: '100%', maxWidth: Layout.maxForm, alignSelf: 'center', padding: Spacing.gutter }}>
            {showSkeleton ? <SkeletonRows count={5} /> : null}
          </View>
        </View>
      );
    // The week after, at the same time; the price is left to the database so packs apply.
    const next = addDays(new Date(source.starts_at), 7);
    return (
      <SessionForm
        day={startOfDay(next)}
        initial={{
          client_id: source.client_id,
          title: source.title,
          starts_at: next.toISOString(),
          duration_minutes: source.duration_minutes,
          location: source.location,
          online: source.online,
          notes: source.notes,
        }}
        submitLabel="Book session"
        repeatable
        startRepeat
        onSubmit={submit}
      />
    );
  }

  const day = fromDayKey(date);
  const initial: Partial<SessionInput> = {
    ...(clientId ? { client_id: clientId } : null),
    ...(time && /^\d{2}:\d{2}$/.test(time) ? { starts_at: combine(day, time).toISOString() } : null),
    ...(duration && Number(duration) > 0 ? { duration_minutes: Number(duration) } : null),
    ...(location ? { location } : null),
    ...(online === '1' ? { online: true } : null),
  };
  return (
    <SessionForm
      day={day}
      initial={Object.keys(initial).length ? initial : undefined}
      submitLabel="Book session"
      repeatable
      startRepeat={repeat === '1'}
      onSubmit={submit}
    />
  );
}
