import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Chips } from '@/components/chips';
import { DayStrip, type StripDay } from '@/components/day-strip';
import { StickyFooter } from '@/components/sticky-footer';
import { useToast } from '@/components/toast';
import { Button, EmptyState, ErrorText, Notice, Section, Skeleton, Text, TextField, useDelayed } from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, Tabular, themed } from '@/constants/theme';
import { bookLabel, cancelLabel, dayParts, firstOf, packForDay } from '@/lib/book-times';
import {
  bookingRefusal,
  bookTime,
  loadBookingInfo,
  loadMyPacks,
  loadOpenTimes,
  type BookingInfo,
  type MyPack,
  type OpenTime,
} from '@/lib/booking';
import { plainError } from '@/lib/errors';
import { shortDate, time24 } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { refreshReminders } from '@/lib/reminders';
import { loadTrainers, trainerTitle, type Trainer } from '@/lib/trainers';
import { addDaysKey, deviceZone, sameZone, zoneCity } from '@/lib/zones';

// Open times load two weeks at a time (the database answers up to 31 days at once).
const CHUNK = 14;
const NOTE_MAX = 300;

type Page =
  | { kind: 'loading' }
  | { kind: 'failed' }
  // An older database: booking in the app isn't there yet.
  | { kind: 'missing' }
  | { kind: 'ready'; trainers: Trainer[]; infos: Record<string, BookingInfo> };

// What a refused booking left on screen: the sentence, and whether Book waits for a new choice.
type Refusal = { message: string; blocked: boolean };

// The person's trainers (and the one in the link), what each allows, and the person's packs. Null on
// an older database, where booking in the app isn't there yet.
async function fetchPage(linkTrainer: string | undefined) {
  const [trainers, mine] = await Promise.all([loadTrainers(), loadMyPacks().catch(() => null)]);
  const ids = [...new Set([...trainers.map((t) => t.trainer_id), ...(linkTrainer ? [linkTrainer] : [])])];
  const answers = await Promise.all(ids.map((id) => loadBookingInfo(id)));
  if (answers.some((a) => a === null)) return null;
  const infos: Record<string, BookingInfo> = {};
  ids.forEach((id, i) => (infos[id] = answers[i]!));
  return { trainers, ids, infos, packs: mine ?? [] };
}

// Book a session: a trainer's open times on their own clock, a day strip and time chips, an optional
// note, and one button that books (Instant) or asks the trainer (Ask me first). The database decides
// which times are open and checks again when the button is pressed.
export default function Book() {
  const params = useLocalSearchParams<{ trainer?: string }>();
  const toast = useToast();
  const wide = useWindowDimensions().width >= 768;
  const [page, setPage] = useState<Page>({ kind: 'loading' });
  const [packs, setPacks] = useState<MyPack[]>([]);
  const [chosen, setChosen] = useState<string | null>(params.trainer ?? null);
  const [length, setLength] = useState<number | null>(null);
  // Open times by day ('YYYY-MM-DD' on the trainer's clock), for the trainer and length they were loaded for.
  const [times, setTimes] = useState<{ key: string; byDay: Map<string, OpenTime[]> }>({ key: '', byDay: new Map() });
  const [timesFailed, setTimesFailed] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [time, setTime] = useState<OpenTime | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [retrying, setRetrying] = useState(false);
  const showSkeleton = useDelayed(300);
  // Chunks asked for, per trainer and length, so each is asked once.
  const asked = useRef(new Set<string>());

  // What each trainer allows and the person's packs; the page shows once all have answered.
  const loadPage = useCallback(
    () =>
      fetchPage(params.trainer).then(
        (answer) => {
          if (!answer) return setPage({ kind: 'missing' });
          setPacks(answer.packs);
          setPage({ kind: 'ready', trainers: answer.trainers, infos: answer.infos });
          // Without a trainer in the link, the first one who can be booked.
          setChosen((c) => c ?? answer.ids.find((id) => answer.infos[id].can_book) ?? answer.ids[0] ?? null);
        },
        () => setPage((p) => (p.kind === 'ready' ? p : { kind: 'failed' })),
      ),
    [params.trainer],
  );

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const info = page.kind === 'ready' && chosen ? (page.infos[chosen] ?? null) : null;
  const bookable = page.kind === 'ready' ? Object.values(page.infos).filter((i) => i.can_book) : [];
  const minutes = info?.can_book
    ? length && info.lengths?.includes(length)
      ? length
      : (info.lengths?.[0] ?? null)
    : null;
  const timesKey = info?.can_book && chosen && minutes ? `${chosen}|${minutes}` : '';

  // The days the strip offers: the trainer's today to as far ahead as they allow.
  const days = useMemo(() => {
    if (!info?.can_book || !info.today) return [] as string[];
    const span = Math.max(0, info.horizon_days ?? 28);
    return Array.from({ length: span + 1 }, (_, i) => addDaysKey(info.today!, i));
  }, [info]);
  const chunks = Math.ceil(days.length / CHUNK);

  const loadChunk = useCallback(
    (index: number, force = false): Promise<void> => {
      if (!timesKey || !chosen || !minutes || index >= chunks) return Promise.resolve();
      const id = `${timesKey}|${index}`;
      if (!force && asked.current.has(id)) return Promise.resolve();
      asked.current.add(id);
      const from = days[index * CHUNK];
      const count = Math.min(CHUNK, days.length - index * CHUNK);
      return loadOpenTimes(chosen, from, count, minutes).then(
        (list) => {
          setTimes((old) => {
            const byDay = new Map(old.key === timesKey ? old.byDay : []);
            for (let i = 0; i < count; i++) byDay.set(days[index * CHUNK + i], []);
            for (const t of list) byDay.get(t.local_day)?.push(t);
            return { key: timesKey, byDay };
          });
          setTimesFailed(false);
        },
        () => {
          asked.current.delete(id);
          setTimesFailed(true);
        },
      );
    },
    [timesKey, chosen, minutes, chunks, days],
  );

  // A new trainer or length starts with the first two weeks.
  useEffect(() => {
    loadChunk(0);
  }, [loadChunk]);

  const byDay = times.key === timesKey ? times.byDay : null;
  const loadedChunks = byDay ? Math.ceil(byDay.size / CHUNK) : 0;
  const firstOpen = byDay ? days.find((d) => (byDay.get(d)?.length ?? 0) > 0) : undefined;
  const allLoadedEmpty = !!byDay && byDay.size > 0 && !firstOpen;
  // How far the empty search went, in weeks, for its message.
  const searchedWeeks = Math.max(1, Math.round((byDay?.size ?? 0) / 7));

  // The first day with times is chosen; an empty first fortnight looks one further ahead by itself. A
  // wide window shows every day, so their times load too.
  useEffect(() => {
    if (!byDay) return;
    if (wide) for (let i = 1; i < chunks; i++) loadChunk(i);
    else if (allLoadedEmpty && loadedChunks < Math.min(2, chunks)) loadChunk(loadedChunks);
  }, [byDay, wide, chunks, loadChunk, allLoadedEmpty, loadedChunks]);

  const chosenDay = day && byDay?.get(day)?.length ? day : (firstOpen ?? null);
  const dayTimes = chosenDay ? (byDay?.get(chosenDay) ?? []) : [];
  const chosenTime = time && dayTimes.some((t) => t.starts_at === time.starts_at) ? time : null;

  function change() {
    setTime(null);
    setRefusal(null);
  }

  async function retryTimes() {
    setRetrying(true);
    await loadChunk(0, true);
    setRetrying(false);
  }

  async function retryPage() {
    setRetrying(true);
    await loadPage();
    setRetrying(false);
  }

  // The rules changed or the time went while the page was open: load the times again from the start.
  async function reloadTimes() {
    asked.current = new Set();
    setTimes({ key: '', byDay: new Map() });
    setTime(null);
    await loadChunk(0, true);
  }

  async function book() {
    if (!info?.can_book || !chosen || !minutes || !chosenTime || !chosenDay) return;
    const first = firstOf(info);
    setBusy(true);
    setRefusal(null);
    try {
      const answer = await bookTime(chosen, chosenTime.starts_at, minutes, note.trim() || null);
      haptic.success();
      if (answer.kind === 'booked') {
        // On the phone's clock, as Plan and Home show it; the times above are on the trainer's.
        const at = new Date(chosenTime.starts_at);
        const yours = !!info.time_zone && !sameZone(deviceZone(), info.time_zone) ? ' your time' : '';
        toast(`Booked. See you ${shortDate(at)} at ${time24(at)}${yours}.`);
        refreshReminders();
      } else toast(`Request sent. ${first} will answer soon.`);
      router.dismissTo({ pathname: '/plan', params: { view: 'sessions' } });
    } catch (e) {
      haptic.warning();
      const message = plainError(e, 'That didn’t book. Check your connection and try again.');
      const raw = (e as { message?: string } | null)?.message ?? '';
      const kind = bookingRefusal(raw);
      if (kind === 'info') {
        await loadPage();
        return;
      }
      setRefusal({ message, blocked: kind === 'limit' });
      if (kind === 'times') await reloadTimes();
    } finally {
      setBusy(false);
    }
  }

  if (page.kind === 'loading') {
    return <Screen>{showSkeleton ? <LoadingTimes /> : null}</Screen>;
  }
  if (page.kind === 'failed') {
    return (
      <Screen>
        <Notice tone="danger" action={{ label: 'Try again', onPress: retryPage, loading: retrying }}>
          Couldn’t load your trainer’s open times.
        </Notice>
      </Screen>
    );
  }
  if (page.kind === 'missing') {
    return (
      <Screen>
        <EmptyState
          icon="calendar-outline"
          title="This isn’t available yet"
          message="Booking in the app arrives with the next update of Voltrix. Message your trainer to book."
        />
      </Screen>
    );
  }

  const linked = chosen ? page.trainers.find((t) => t.trainer_id === chosen) : undefined;
  const name = info?.trainer_name || info?.business_name || (linked ? trainerTitle(linked) : 'Your trainer');
  const first = info ? firstOf(info, linked ? firstOf(linked) : 'your trainer') : 'your trainer';
  const chatId = info?.client_id ?? linked?.client_id ?? null;
  const avatar = info?.trainer_avatar ?? linked?.trainer_avatar ?? null;

  function message() {
    if (!chatId) return;
    router.push({ pathname: '/chat/[id]', params: { id: chatId, name, avatar: avatar ?? '' } });
  }

  if (!info || !info.can_book) {
    const reason = info?.reason ?? 'not_linked';
    const words =
      reason === 'paused'
        ? { title: `${first} has paused your sessions`, message: `Message ${first} to book.` }
        : reason === 'off'
          ? { title: `${first} doesn’t take bookings in the app`, message: `Message ${first} to book.` }
          : reason === 'lapsed'
            ? { title: `${first} can’t take bookings in the app right now`, message: `Message ${first} to book.` }
            : page.trainers.length === 0
              ? {
                  title: 'Find a trainer to book with',
                  message: 'Once you train with someone on Voltrix, book their open times here.',
                }
              : { title: 'Book with your own trainer', message: 'You can book with your own trainer only.' };
    const noTrainer = page.trainers.length === 0;
    return (
      <Screen>
        <EmptyState
          icon="calendar-clear-outline"
          title={words.title}
          message={words.message}
          testID="book-unavailable"
          action={
            reason === 'not_linked' ? (
              noTrainer ? (
                <Button title="Trainers" variant="secondary" size="medium" onPress={() => router.push('/trainers')} />
              ) : undefined
            ) : chatId ? (
              <Button
                title={`Message ${first}`}
                icon="chatbubble-outline"
                variant="secondary"
                size="medium"
                onPress={message}
              />
            ) : undefined
          }
        />
      </Screen>
    );
  }

  const lengths = info.lengths ?? [];
  const phoneZone = deviceZone();
  const zoneDiffers = !!info.time_zone && !!phoneZone && !sameZone(phoneZone, info.time_zone);
  const pack = chosenDay ? packForDay(packs, chosen!, chosenDay) : null;
  const stripDays: StripDay[] = days.map((d) => ({ key: d, count: byDay?.has(d) ? byDay.get(d)!.length : null }));
  const mode = info.mode === 'auto' ? 'auto' : 'approve';
  const cancelWords =
    info.cancel_minutes == null
      ? `To cancel, message ${first}.`
      : info.cancel_minutes === 0
        ? 'You can cancel in the app until it starts.'
        : `You can cancel in the app until ${cancelLabel(info.cancel_minutes)} before.`;
  const after = mode === 'auto' ? cancelWords : `${first} approves it in Voltrix Coach. You’ll see the answer here.`;
  // The chosen time on the phone's clock, when the trainer's differs.
  const yourTime =
    zoneDiffers && chosenTime
      ? `That’s ${shortDate(new Date(chosenTime.starts_at))} at ${time24(new Date(chosenTime.starts_at))} your time.`
      : null;
  const trainerChips = Object.fromEntries(
    bookable.map((b) => {
      const t = page.trainers.find((x) => x.trainer_id === b.trainer_id);
      return [b.trainer_id!, firstOf(b, t ? firstOf(t) : 'Trainer')];
    }),
  );

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.with}>
          <Avatar url={avatar} name={name} size={28} />
          <Text variant="callout" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
            with {name}
          </Text>
        </View>

        {bookable.length > 1 ? (
          <Chips
            options={trainerChips}
            value={chosen}
            onChange={(id) => {
              if (!id || id === chosen) return;
              setChosen(id);
              setDay(null);
              change();
            }}
            testIDPrefix="book-trainer-"
          />
        ) : null}

        {lengths.length > 1 ? (
          <Chips
            options={Object.fromEntries(lengths.map((n) => [String(n), `${n} min`]))}
            value={minutes ? String(minutes) : null}
            onChange={(n) => {
              if (!n) return;
              setLength(Number(n));
              change();
            }}
            testIDPrefix="book-length-"
          />
        ) : null}

        {zoneDiffers ? (
          <View testID="book-zone-notice">
            <Notice>
              Times are in {zoneCity(info.time_zone!)} time, where {first} trains.
            </Notice>
          </View>
        ) : null}

        {timesFailed && !byDay ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retryTimes, loading: retrying }}>
            Couldn’t load {first}’s open times.
          </Notice>
        ) : !byDay ? (
          showSkeleton ? (
            <LoadingTimes />
          ) : null
        ) : (
          <>
            <DayStrip
              days={stripDays}
              value={chosenDay}
              onChange={(d) => {
                setDay(d);
                change();
              }}
              onNearEnd={() => loadChunk(loadedChunks)}
            />
            {chosenDay ? (
              <View style={{ gap: Spacing.four }}>
                {dayParts(dayTimes).map((part) => (
                  <Section key={part.label} title={part.label}>
                    <TimeGrid
                      times={part.times}
                      value={chosenTime?.starts_at ?? null}
                      onChange={(t) => {
                        setTime(t);
                        setRefusal(null);
                      }}
                    />
                  </Section>
                ))}
              </View>
            ) : (
              <EmptyState
                compact
                icon="calendar-clear-outline"
                title={
                  searchedWeeks === 1
                    ? 'No open times in the next week'
                    : `No open times in the next ${searchedWeeks} weeks`
                }
                message={`Try later days, or message ${first}.`}
                action={
                  chatId ? (
                    <Button title={`Message ${first}`} variant="secondary" size="small" onPress={message} />
                  ) : null
                }
                testID="book-no-times"
              />
            )}
            {timesFailed ? <ErrorText>Couldn’t load more open times. Check your connection.</ErrorText> : null}
          </>
        )}

        <View style={{ gap: Spacing.two }}>
          <TextField
            label={`Note for ${first}`}
            optional
            value={note}
            onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
            placeholder="Anything to know for this session"
            multiline
            maxLength={NOTE_MAX}
            testID="book-note"
            style={styles.note}
          />
          {pack ? (
            <Text variant="footnote" tone="secondary" style={Tabular} testID="book-pack">
              Uses your pack · {pack.sessions_left} left
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <StickyFooter>
        <ErrorText testID="book-error">{refusal?.message}</ErrorText>
        {yourTime ? (
          <Text variant="footnote" style={[{ textAlign: 'center' }, Tabular]} testID="book-your-time">
            {yourTime}
          </Text>
        ) : null}
        <Button
          title={
            chosenTime && chosenDay
              ? bookLabel(mode, chosenDay, chosenTime.local_time, first)
              : mode === 'auto'
                ? 'Pick a time'
                : `Pick a time to ask ${first}`
          }
          onPress={book}
          loading={busy}
          disabled={!chosenTime || !!refusal?.blocked}
          testID="book-submit"
        />
        <Text variant="footnote" tone="secondary" style={{ textAlign: 'center' }}>
          {after}
        </Text>
      </StickyFooter>
    </KeyboardAvoidingView>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  );
}

// The day strip and three rows of time chips, while the times load.
function LoadingTimes() {
  return (
    <View style={{ gap: Spacing.four }} accessible accessibilityLabel="Loading">
      <View style={styles.skeletonDays}>
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} width={46} height={52} radius={10} />
        ))}
      </View>
      <View style={{ gap: Spacing.tight }}>
        <Skeleton width={80} height={12} radius={6} />
        <View style={styles.grid}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} width={72} height={36} radius={Radius.pill} />
          ))}
        </View>
      </View>
    </View>
  );
}

// The day's start times as chips that wrap, in the trainer's clock as the database answers them. The
// chosen one is inverted (text-coloured), never orange.
function TimeGrid({
  times,
  value,
  onChange,
}: {
  times: OpenTime[];
  value: string | null;
  onChange: (t: OpenTime) => void;
}) {
  return (
    <View style={styles.grid}>
      {times.map((t) => {
        const selected = t.starts_at === value;
        return (
          <Pressable
            key={t.starts_at}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={t.local_time}
            testID={`book-time-${t.local_time.replace(':', '-')}`}
            onPress={() => {
              if (selected) return;
              haptic.select();
              onChange(t);
            }}
            style={[styles.timeTarget, Platform.OS === 'web' && { cursor: 'pointer' }]}>
            {({ pressed }) => (
              <View
                style={[
                  styles.time,
                  pressed && { backgroundColor: Colors.tintPressed },
                  selected && { backgroundColor: Colors.text },
                ]}>
                <Text variant="callout" style={[styles.timeText, selected && { color: Colors.background }]}>
                  {t.local_time}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => ({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    width: '100%',
    maxWidth: Layout.maxClient,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.section,
    gap: Spacing.four,
  },
  with: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
  skeletonDays: {
    flexDirection: 'row',
    gap: 4,
    overflow: 'hidden',
  },
  timeTarget: {
    minHeight: 44,
    justifyContent: 'center',
  },
  time: {
    minHeight: 36,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tint,
  },
  timeText: {
    ...Tabular,
    fontFamily: Fonts.textMedium,
    color: Colors.text,
  },
  note: {
    minHeight: 88,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
}));
