import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { Avatar } from '@/components/avatar';
import { Chips } from '@/components/chips';
import { Sheet } from '@/components/sheet';
import { StickyFooter } from '@/components/sticky-footer';
import {
  Button,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Notice,
  SearchField,
  SkeletonRows,
  Text,
  TextField,
  Toggle,
} from '@/components/ui';
import { Colors, Fonts, Layout, Radius, Spacing, Tabular, themed, withAlpha } from '@/constants/theme';
import { fullName, type Client } from '@/lib/clients';
import { haptic } from '@/lib/haptics';
import {
  addDays,
  combine,
  DURATIONS,
  formatDay,
  formatTime,
  overlaps,
  SESSION_COLUMNS,
  sessionName,
  START_TIMES,
  startOfDay,
  timeKey,
  type Session,
} from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

export type SessionInput = {
  client_id: string | null;
  title: string | null;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  online: boolean;
};

const NO_CLIENT = 'none';

type Props = {
  // The session being edited, or the day and client to start a new one with.
  initial?: Partial<SessionInput> & { id?: string };
  day: Date;
  submitLabel: string;
  onSubmit: (input: SessionInput) => Promise<string | null>;
  // Inside a sheet: the sheet scrolls, and the button sits at the end of the form. Otherwise the
  // form scrolls by itself and the button stays in a bar at the bottom.
  inSheet?: boolean;
  children?: ReactNode;
};

type ClientChoice = Pick<Client, 'id' | 'first_name' | 'last_name'>;

function orNull(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

// Where the start times open: the chosen time, or else the first free half hour from now (today)
// or from 06:00 (another day), so the trainer doesn't scroll past times that make no sense.
function sensibleTime(day: Date, duration: number, bookings: Session[], now = new Date()) {
  const from = startOfDay(day).getTime() === startOfDay(now).getTime() ? timeKey(now) : '06:00';
  const free = START_TIMES.find(
    (t) =>
      t >= from &&
      !bookings.some((b) => overlaps({ starts_at: combine(day, t).toISOString(), duration_minutes: duration }, b)),
  );
  return free ?? START_TIMES.find((t) => t >= from) ?? START_TIMES[START_TIMES.length - 1];
}

export function SessionForm({ initial, day: initialDay, submitLabel, onSubmit, inSheet, children }: Props) {
  const initialStart = initial?.starts_at ? new Date(initial.starts_at) : null;
  const [clients, setClients] = useState<ClientChoice[] | null>(null);
  const [who, setWho] = useState<string | null>(initial?.client_id ?? (initial?.title ? NO_CLIENT : null));
  const [picking, setPicking] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [day, setDay] = useState(startOfDay(initialStart ?? initialDay));
  const [time, setTime] = useState<string | null>(initialStart ? timeKey(initialStart) : null);
  const [duration, setDuration] = useState<string | null>(String(initial?.duration_minutes ?? 60));
  const [location, setLocation] = useState(initial?.location ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [online, setOnline] = useState(initial?.online ?? false);
  const [dayBookings, setDayBookings] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, first_name, last_name')
      .eq('status', 'active')
      .order('first_name')
      .then(({ data }) => setClients((data as ClientChoice[]) ?? []));
  }, []);

  // The day's other bookings, to warn about double-booking.
  useEffect(() => {
    supabase
      .from('sessions')
      .select(SESSION_COLUMNS)
      .eq('status', 'scheduled')
      .gte('starts_at', day.toISOString())
      .lt('starts_at', addDays(day, 1).toISOString())
      .then(({ data }) => setDayBookings(((data as unknown as Session[]) ?? []).filter((s) => s.id !== initial?.id)));
  }, [day, initial?.id]);

  const clientName =
    who === NO_CLIENT
      ? null
      : (() => {
          const c = clients?.find((x) => x.id === who);
          // A paused or archived client stays on their own session while it is edited.
          return c ? fullName(c) : who ? 'Current client' : null;
        })();

  const times = time && !START_TIMES.includes(time) ? [...START_TIMES, time].sort() : START_TIMES;
  const scrollTo = time ?? (dayBookings ? sensibleTime(day, Number(duration ?? 60), dayBookings) : null);

  const mine =
    time && duration ? { starts_at: combine(day, time).toISOString(), duration_minutes: Number(duration) } : null;
  const clash = mine ? ((dayBookings ?? []).find((s) => overlaps(mine, s)) ?? null) : null;

  async function submit() {
    setError(null);
    if (!who) return setError('Choose a client, or block time without one.');
    if (who === NO_CLIENT && !title.trim()) return setError('Give this time a name, like “Group class”.');
    if (!time) return setError('Pick a start time.');
    setBusy(true);
    const problem = await onSubmit({
      client_id: who === NO_CLIENT ? null : who,
      title: who === NO_CLIENT ? title.trim() : null,
      starts_at: combine(day, time).toISOString(),
      duration_minutes: Number(duration ?? 60),
      location: orNull(location),
      notes: orNull(notes),
      // A video call needs a client to call.
      online: who !== NO_CLIENT && online,
    });
    setBusy(false);
    if (problem) setError(problem);
  }

  const button = <Button title={submitLabel} onPress={submit} loading={busy} />;

  const fields = (
    <>
      <View style={styles.field}>
        <Text variant="footnote" tone="secondary" style={styles.label}>
          Client
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            who === NO_CLIENT
              ? 'Client: no client, blocked time. Change'
              : clientName
                ? `Client: ${clientName}. Change`
                : 'Choose a client'
          }
          onPress={() => setPicking(true)}
          style={({ pressed }) => [styles.picker, pressed && { backgroundColor: Colors.tintPressed }]}>
          {who === NO_CLIENT ? (
            <Ionicons name="time-outline" size={22} color={Colors.textSecondary} />
          ) : clientName ? (
            <Avatar name={clientName} size={28} />
          ) : null}
          <Text
            variant="body"
            tone={who ? 'primary' : 'secondary'}
            numberOfLines={1}
            style={{ flex: 1, fontFamily: who ? Fonts.textMedium : Fonts.text }}>
            {who === NO_CLIENT ? 'No client (block time)' : (clientName ?? 'Choose a client')}
          </Text>
          <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
        </Pressable>
        {clients && clients.length === 0 && !initial?.client_id ? (
          <Text variant="footnote" tone="secondary">
            You have no active clients yet. Add one first, or block time without a client.
          </Text>
        ) : null}
      </View>
      {who === NO_CLIENT ? (
        <TextField
          label="What is it?"
          value={title}
          onChangeText={setTitle}
          autoCapitalize="sentences"
          placeholder="For example: Group class"
          maxLength={120}
        />
      ) : null}

      <View style={styles.field}>
        <Text variant="footnote" tone="secondary" style={styles.label}>
          Day
        </Text>
        <View style={styles.dayRow}>
          <IconButton
            icon="chevron-back"
            variant="tonal"
            label="Previous day"
            onPress={() => {
              haptic.select();
              setDayBookings(null);
              setDay(addDays(day, -1));
            }}
          />
          <Text variant="headline" style={styles.dayText} accessibilityLiveRegion="polite">
            {formatDay(day)}
          </Text>
          <IconButton
            icon="chevron-forward"
            variant="tonal"
            label="Next day"
            onPress={() => {
              haptic.select();
              setDayBookings(null);
              setDay(addDays(day, 1));
            }}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text variant="footnote" tone="secondary" style={styles.label}>
          Start time
        </Text>
        <TimeChips
          key={dayKeyOf(day)}
          times={times}
          value={time}
          scrollTo={scrollTo}
          booked={dayBookings ?? []}
          day={day}
          duration={Number(duration ?? 60)}
          background={inSheet ? Colors.surfaceHigh : undefined}
          onChange={setTime}
        />
        {clash ? (
          <Notice tone="warning" onCard={inSheet}>
            This overlaps with {sessionName(clash)} at {formatTime(new Date(clash.starts_at))}.
          </Notice>
        ) : null}
      </View>

      <View style={styles.field}>
        <Text variant="footnote" tone="secondary" style={styles.label}>
          Length
        </Text>
        <Chips
          options={DURATIONS}
          value={duration}
          onChange={(d) => setDuration(d ?? '60')}
          background={inSheet ? Colors.surfaceHigh : undefined}
        />
      </View>

      {who && who !== NO_CLIENT ? (
        <Group style={inSheet ? { backgroundColor: Colors.tint } : undefined}>
          <ListRow
            title="Online (video call)"
            leading={<IconTile icon="videocam-outline" />}
            compact
            last
            trailing={<Toggle accessibilityLabel="Online (video call)" value={online} onValueChange={setOnline} />}
          />
        </Group>
      ) : null}

      <TextField
        label="Where"
        optional
        value={location}
        onChangeText={setLocation}
        autoCapitalize="sentences"
        placeholder={online && who !== NO_CLIENT ? 'For example: their home gym' : 'For example: Main gym'}
        maxLength={200}
      />
      <TextField
        label="Notes"
        optional
        value={notes}
        onChangeText={setNotes}
        autoCapitalize="sentences"
        placeholder="Anything to remember for this session"
        maxLength={2000}
        multiline
        style={styles.notes}
      />
      <ErrorText>{error}</ErrorText>
    </>
  );

  const picker = (
    <ClientPicker
      visible={picking}
      clients={clients}
      selected={who}
      onClose={() => setPicking(false)}
      onPick={(id) => {
        haptic.select();
        setWho(id);
        setPicking(false);
      }}
    />
  );

  if (inSheet) {
    return (
      <View style={styles.sheetContent}>
        {fields}
        {button}
        {children}
        {picker}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {fields}
        {children}
      </ScrollView>
      <StickyFooter>{button}</StickyFooter>
      {picker}
    </KeyboardAvoidingView>
  );
}

function dayKeyOf(day: Date) {
  return `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
}

// The start times. On a phone they are one sideways row, opened at the chosen time or the next sensible
// one with the time before it showing too, and soft fades at the edges that still have more. On a wider
// window (a mouse has no sideways scroll) they wrap onto lines. A time that clashes with another
// booking shows a small dot.
function TimeChips({
  times,
  value,
  scrollTo,
  booked,
  day,
  duration,
  background,
  onChange,
}: {
  // The colour behind the row, for its edge fades: the page by default, or the sheet's.
  background?: string;
  times: string[];
  value: string | null;
  scrollTo: string | null;
  booked: Session[];
  day: Date;
  duration: number;
  onChange: (time: string) => void;
}) {
  const wrap = useWindowDimensions().width >= 768;
  const scroll = useRef<ScrollView>(null);
  // Where each chip sits, and whether the row has been opened at the right time yet. The time to
  // open at can arrive after the chips are laid out (once the day's bookings load).
  const spots = useRef(new Map<string, number>());
  const placed = useRef(false);
  const [edges, setEdges] = useState({ start: true, end: false });

  function place(time: string | null) {
    const x = time ? spots.current.get(time) : undefined;
    if (wrap || placed.current || x === undefined) return;
    placed.current = true;
    // The time before it stays in view, so the row opens mid-day without hiding that it goes earlier.
    const before = times[times.indexOf(time!) - 1];
    const from = (before ? spots.current.get(before) : undefined) ?? x;
    scroll.current?.scrollTo({ x: Math.max(0, from - Spacing.gutter), animated: false });
  }

  useEffect(() => {
    place(scrollTo);
  });

  const behind = background ?? Colors.background;
  const fade = (to: 'left' | 'right') => {
    const gradient = `linear-gradient(to ${to}, ${withAlpha(behind, 0)}, ${behind})`;
    return (
      Platform.OS === 'web' ? { backgroundImage: gradient } : { experimental_backgroundImage: gradient }
    ) as ViewStyle;
  };

  const chips = times.map((t) => {
    const selected = t === value;
    const taken = booked.some((b) =>
      overlaps({ starts_at: combine(day, t).toISOString(), duration_minutes: duration }, b),
    );
    return (
      <Pressable
        key={t}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={taken ? `${t}, overlaps another booking` : t}
        onPress={() => {
          if (!selected) haptic.select();
          onChange(t);
        }}
        onLayout={(e) => {
          spots.current.set(t, e.nativeEvent.layout.x);
          if (t === scrollTo) place(t);
        }}
        style={styles.timeTarget}>
        {({ pressed }) => (
          <View
            style={[
              styles.time,
              pressed && { backgroundColor: Colors.tintPressed },
              selected && { backgroundColor: Colors.text },
            ]}>
            <Text variant="callout" style={[styles.timeText, selected && { color: Colors.background }]}>
              {t}
            </Text>
            {taken && !selected ? <View style={styles.takenDot} /> : null}
          </View>
        )}
      </Pressable>
    );
  });

  if (wrap) return <View style={styles.timeWrap}>{chips}</View>;
  return (
    <View style={styles.bleed}>
      <ScrollView
        ref={scroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const start = contentOffset.x <= 2;
          const end = contentOffset.x + layoutMeasurement.width >= contentSize.width - 2;
          if (start !== edges.start || end !== edges.end) setEdges({ start, end });
        }}
        contentContainerStyle={styles.timeRow}>
        {chips}
      </ScrollView>
      {edges.start ? null : <View pointerEvents="none" style={[styles.fadeLeft, fade('left')]} />}
      {edges.end ? null : <View pointerEvents="none" style={[styles.fadeRight, fade('right')]} />}
    </View>
  );
}

// Choosing who the session is with: search, then one tap.
function ClientPicker({
  visible,
  clients,
  selected,
  onClose,
  onPick,
}: {
  visible: boolean;
  clients: ClientChoice[] | null;
  selected: string | null;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = (clients ?? []).filter((c) => !q || fullName(c).toLowerCase().includes(q));
  const check = <Ionicons name="checkmark" size={20} color={Colors.text} />;
  return (
    <Sheet visible={visible} onClose={onClose} onClosed={() => setQuery('')} title="Choose a client">
      {(clients?.length ?? 0) > 6 ? (
        <SearchField value={query} onChangeText={setQuery} placeholder="Search clients" />
      ) : null}
      {!clients ? (
        <Group style={{ backgroundColor: Colors.tint }}>
          <SkeletonRows count={3} avatar />
        </Group>
      ) : (
        <Group style={{ backgroundColor: Colors.tint }}>
          {shown.map((c) => (
            <ListRow
              key={c.id}
              title={fullName(c)}
              leading={<Avatar name={fullName(c)} size={40} />}
              trailing={selected === c.id ? check : null}
              chevron={false}
              compact
              onPress={() => onPick(c.id)}
              accessibilityState={{ selected: selected === c.id }}
            />
          ))}
          <ListRow
            title="No client (block time)"
            subtitle="A class, a break or admin"
            leading={<IconTile icon="time-outline" />}
            trailing={selected === NO_CLIENT ? check : null}
            chevron={false}
            compact
            last
            onPress={() => onPick(NO_CLIENT)}
            accessibilityState={{ selected: selected === NO_CLIENT }}
          />
        </Group>
      )}
      {clients && q && shown.length === 0 ? (
        <Text variant="callout" tone="secondary">
          No client called “{query.trim()}”.
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = themed(() => ({
  content: {
    width: '100%',
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.section,
    gap: Spacing.four,
  },
  sheetContent: {
    gap: Spacing.four,
  },
  field: {
    gap: Spacing.two,
  },
  label: {
    fontFamily: Fonts.textMedium,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    backgroundColor: Colors.tint,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  dayText: {
    ...Tabular,
    flex: 1,
    textAlign: 'center',
  },
  bleed: {
    marginHorizontal: -Spacing.gutter,
  },
  timeRow: {
    paddingHorizontal: Spacing.gutter,
    columnGap: Spacing.two,
  },
  timeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
  fadeLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: Spacing.four,
  },
  fadeRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: Spacing.four,
  },
  timeTarget: {
    minHeight: 44,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  time: {
    minHeight: 36,
    minWidth: 64,
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
  takenDot: {
    position: 'absolute',
    top: 5,
    right: 9,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.warning,
  },
  notes: {
    minHeight: 88,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
}));
