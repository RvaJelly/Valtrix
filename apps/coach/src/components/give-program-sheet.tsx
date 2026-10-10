import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppStatusLabel } from '@/components/app-status';
import { Avatar } from '@/components/avatar';
import { Chips } from '@/components/chips';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import {
  Button,
  EmptyState,
  ErrorText,
  Group,
  IconButton,
  IconTile,
  ListRow,
  Section,
  SearchField,
  SkeletonRows,
  Text,
  Toggle,
  useDelayed,
} from '@/components/ui';
import { Colors, Spacing, Tabular } from '@/constants/theme';
import { fullName, shownStatusOf, type AppStatus } from '@/lib/clients';
import { plainError } from '@/lib/errors';
import { dayMonth, shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { addDaysTo, cutDate, daysPerWeek, mondayOf, startChoices } from '@/lib/plan-dates';
import { daysLabelShort, giveProgram, weeksLabel } from '@/lib/programs';
import { addFailure } from '@/lib/save-error';
import { dayKey, fromDayKey } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';
import { startFromTemplate, templateSubtitle, type Template } from '@/lib/templates';

export type ProgramChoice = { id: string; name: string; weeks: number; days: number };
export type ClientChoice = { id: string; first_name: string; last_name: string | null; app_status?: AppStatus | null };

// Give a program to a client: which program (when the page doesn't know), which client (when the
// page doesn't know), the Monday it starts, and whether what is running now ends.
export function GiveProgramSheet({
  visible,
  onClose,
  program,
  client,
  onGiven,
}: {
  visible: boolean;
  onClose: () => void;
  program?: ProgramChoice | null;
  client?: ClientChoice | null;
  onGiven?: () => void;
}) {
  // A fresh start each time it opens.
  const [opened, setOpened] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpened((n) => n + 1);
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Give a program">
      <GiveProgramFlow
        key={opened}
        program={program ?? null}
        client={client ?? null}
        onClose={onClose}
        onGiven={onGiven}
      />
    </Sheet>
  );
}

export function GiveProgramFlow({
  program: knownProgram,
  client: knownClient,
  onClose,
  onGiven,
}: {
  program: ProgramChoice | null;
  client: ClientChoice | null;
  onClose: () => void;
  onGiven?: () => void;
}) {
  const [program, setProgram] = useState<ProgramChoice | null>(knownProgram);
  const [client, setClient] = useState<ClientChoice | null>(knownClient);
  if (!program) return <ProgramPicker onPick={setProgram} />;
  if (!client) return <ClientPicker onPick={setClient} />;
  return (
    <StartForm
      program={program}
      client={client}
      onClose={onClose}
      onGiven={onGiven}
      onChangeProgram={knownProgram ? undefined : () => setProgram(null)}
      onChangeClient={knownClient ? undefined : () => setClient(null)}
    />
  );
}

type ProgramRow = {
  id: string;
  name: string;
  weeks: number;
  program_slots: { weekdays: number[]; week_from: number; week_to: number | null }[];
};

// The trainer's programs, then the Voltrix program templates.
export function ProgramPicker({ onPick }: { onPick: (program: ProgramChoice) => void }) {
  const [programs, setPrograms] = useState<ProgramRow[] | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [using, setUsing] = useState<string | null>(null);
  const showSkeleton = useDelayed(300);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from('programs').select('id, name, weeks, program_slots(weekdays, week_from, week_to)').order('name'),
      supabase
        .from('voltrix_templates')
        .select('id, slug, kind, name, summary, level, equipment, weeks, days_per_week, minutes, position')
        .eq('kind', 'program')
        .order('position'),
    ]).then(([own, voltrix]) => {
      if (!alive) return;
      if (own.error) setError(plainError(own.error));
      setPrograms((own.data ?? []) as ProgramRow[]);
      setTemplates((voltrix.data ?? []) as Template[]);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function pickTemplate(t: Template) {
    setUsing(t.id);
    setError(null);
    try {
      const id = await startFromTemplate(t.id);
      haptic.success();
      onPick({ id, name: t.name, weeks: t.weeks, days: t.days_per_week });
    } catch (e) {
      setError(await addFailure(e));
    }
    setUsing(null);
  }

  const term = search.trim().toLowerCase();
  const mine = (programs ?? []).filter((p) => !term || p.name.toLowerCase().includes(term));
  const theirs = (templates ?? []).filter((t) => !term || t.name.toLowerCase().includes(term));
  return (
    <View style={{ gap: Spacing.three }}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Search programs" />
      <ErrorText>{error}</ErrorText>
      {!programs ? (
        showSkeleton ? (
          <SkeletonRows count={4} />
        ) : null
      ) : (
        <>
          {mine.length ? (
            <Group style={{ backgroundColor: Colors.tint }}>
              {mine.map((p, i) => {
                const days = daysPerWeek(p.program_slots, p.weeks);
                return (
                  <ListRow
                    key={p.id}
                    title={p.name}
                    subtitle={`${weeksLabel(p.weeks)} · ${daysLabelShort(days)}`}
                    leading={<IconTile icon="layers-outline" />}
                    onPress={() => onPick({ id: p.id, name: p.name, weeks: p.weeks, days })}
                    testID={`give-program-${p.id}`}
                    last={i === mine.length - 1}
                  />
                );
              })}
            </Group>
          ) : programs.length ? null : (
            <Text variant="callout" tone="secondary">
              No programs yet. Start from a Voltrix template below.
            </Text>
          )}
          {theirs.length ? (
            <Section title="Voltrix templates">
              <Group style={{ backgroundColor: Colors.tint }}>
                {theirs.map((t, i) => (
                  <ListRow
                    key={t.id}
                    title={t.name}
                    subtitle={using === t.id ? 'Adding to your programs…' : templateSubtitle(t)}
                    subtitleLines={2}
                    leading={<IconTile icon="layers-outline" />}
                    onPress={() => {
                      if (!using) pickTemplate(t);
                    }}
                    testID={`give-program-${t.slug}`}
                    last={i === theirs.length - 1}
                  />
                ))}
              </Group>
            </Section>
          ) : null}
        </>
      )}
    </View>
  );
}

type ClientRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  app_status: AppStatus | null;
  user_id: string | null;
  invite_shared_at: string | null;
};

// Active clients to choose from.
export function ClientPicker({ onPick, title }: { onPick: (client: ClientChoice) => void; title?: string }) {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = useDelayed(300);

  useEffect(() => {
    let alive = true;
    supabase
      .from('clients')
      .select('id, first_name, last_name, app_status, user_id, invite_shared_at')
      .eq('status', 'active')
      .order('first_name')
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setError(plainError(error));
        setClients((data ?? []) as ClientRow[]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const term = search.trim().toLowerCase();
  const shown = (clients ?? []).filter((c) => !term || fullName(c).toLowerCase().includes(term));
  return (
    <View style={{ gap: Spacing.three }}>
      {title ? (
        <Text variant="callout" tone="secondary">
          {title}
        </Text>
      ) : null}
      <SearchField value={search} onChangeText={setSearch} placeholder="Search clients" />
      <ErrorText>{error}</ErrorText>
      {!clients ? (
        showSkeleton ? (
          <SkeletonRows count={4} avatar />
        ) : null
      ) : clients.length === 0 ? (
        <EmptyState
          compact
          icon="people-outline"
          title="No active clients"
          message="Clients you add show here."
          action={
            <Button title="Add a client" variant="secondary" size="small" onPress={() => router.push('/clients/new')} />
          }
        />
      ) : (
        <Group style={{ backgroundColor: Colors.tint }}>
          {shown.map((c, i) => {
            const name = fullName(c);
            return (
              <ListRow
                key={c.id}
                title={name}
                leading={<Avatar name={name} size={40} />}
                status={shownStatusOf(c) !== 'joined' ? <AppStatusLabel status={shownStatusOf(c)} short /> : null}
                onPress={() => onPick(c)}
                testID={`give-client-${c.id}`}
                last={i === shown.length - 1}
              />
            );
          })}
        </Group>
      )}
    </View>
  );
}

type Running = {
  assignments: { id: string; name: string; starts_on: string; ends_on: string }[];
  singles: { id: string; starts_on: string | null; ends_on: string | null }[];
};

function StartForm({
  program,
  client,
  onClose,
  onGiven,
  onChangeProgram,
  onChangeClient,
}: {
  program: ProgramChoice;
  client: ClientChoice;
  onClose: () => void;
  onGiven?: () => void;
  onChangeProgram?: () => void;
  onChangeClient?: () => void;
}) {
  const toast = useToast();
  const today = dayKey(new Date());
  const choices = startChoices(today);
  const last = addDaysTo(mondayOf(today), 52 * 7);
  const [start, setStart] = useState(choices[0]);
  const [picking, setPicking] = useState(false);
  const [endCurrent, setEndCurrent] = useState(true);
  const [running, setRunning] = useState<Running | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      supabase.from('plan_assignments').select('id, name, starts_on, ends_on').eq('client_id', client.id),
      supabase.from('plan_items').select('id, starts_on, ends_on').eq('client_id', client.id).is('assignment_id', null),
    ]).then(([a, s]) => {
      if (!alive) return;
      setRunning({
        assignments: (a.data ?? []) as Running['assignments'],
        singles: (s.data ?? []) as Running['singles'],
      });
    });
    return () => {
      alive = false;
    };
  }, [client.id]);

  const cut = cutDate(start, today);
  // What ends on the cut: running past it and started by then. Programs starting on or after the
  // chosen Monday run alongside.
  const ending = running
    ? {
        programs: running.assignments.filter((a) => a.starts_on <= cut && a.ends_on > cut),
        singles: running.singles.filter((s) => (!s.ends_on || s.ends_on > cut) && (!s.starts_on || s.starts_on <= cut)),
      }
    : null;
  const alongside = running?.assignments.filter((a) => a.starts_on >= start) ?? [];
  const anyEnding = !!ending && (ending.programs.length > 0 || ending.singles.length > 0);
  const end = addDaysTo(start, program.weeks * 7 - 1);
  const thisMonday = mondayOf(today);
  const chipOptions: Record<string, string> = {};
  for (const day of choices) {
    chipOptions[day] = day === thisMonday ? `This week (${shortDate(fromDayKey(day))})` : shortDate(fromDayKey(day));
  }
  chipOptions.pick = 'Pick a week…';
  const chipValue = picking || !choices.includes(start) ? 'pick' : start;

  function choose(value: string | null) {
    if (!value) return;
    if (value === 'pick') {
      setPicking(true);
      if (choices.includes(start)) setStart(addDaysTo(choices[choices.length - 1], 7));
    } else {
      setPicking(false);
      setStart(value);
    }
  }

  function step(by: number) {
    haptic.select();
    setStart((s) => {
      const next = addDaysTo(s, by * 7);
      return next < choices[0] || next > last ? s : next;
    });
  }

  function endingWords() {
    if (!ending) return '';
    const parts: string[] = [];
    if (ending.programs.length === 1) parts.push(ending.programs[0].name);
    else if (ending.programs.length > 1) parts.push(`${ending.programs.length} programs`);
    if (ending.singles.length === 1) parts.push('1 workout');
    else if (ending.singles.length > 1) parts.push(`${ending.singles.length} workouts`);
    const what = parts.join(' and ');
    const one = ending.programs.length + ending.singles.length === 1;
    return `${what} ${one ? 'ends' : 'end'} ${shortDate(fromDayKey(cut))}. Ticks and history stay.`;
  }

  async function give() {
    setBusy(true);
    setError(null);
    try {
      await giveProgram(program.id, client.id, start, anyEnding && endCurrent);
      haptic.success();
      onClose();
      onGiven?.();
      toast(`${client.first_name} starts ${program.name} on ${dayMonth(fromDayKey(start))}`, {
        action: {
          label: 'View',
          onPress: () => router.push({ pathname: '/clients/[id]', params: { id: client.id, tab: 'plan' } }),
        },
      });
    } catch (e) {
      haptic.warning();
      setError(await addFailure(e));
    }
    setBusy(false);
  }

  return (
    <View style={{ gap: Spacing.four }}>
      <Group style={{ backgroundColor: Colors.tint }}>
        <ListRow
          title={program.name}
          subtitle={`${weeksLabel(program.weeks)} · ${daysLabelShort(program.days)}`}
          leading={<IconTile icon="layers-outline" />}
          chevron={!!onChangeProgram}
          onPress={onChangeProgram}
          accessibilityLabel={onChangeProgram ? `${program.name}. Choose another program` : undefined}
          compact
        />
        <ListRow
          title={fullName(client)}
          leading={<Avatar name={fullName(client)} size={40} />}
          chevron={!!onChangeClient}
          onPress={onChangeClient}
          accessibilityLabel={onChangeClient ? `${fullName(client)}. Choose another client` : undefined}
          compact
          last
        />
      </Group>

      <View style={{ gap: Spacing.tight }}>
        <Text variant="label" tone="secondary" accessibilityRole="header">
          Starts
        </Text>
        <Chips options={chipOptions} value={chipValue} onChange={choose} wrap testIDPrefix="give-start-" />
        {chipValue === 'pick' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
            <IconButton icon="remove" label="A week earlier" onPress={() => step(-1)} disabled={start <= choices[0]} />
            <Text variant="callout" style={[Tabular, { flex: 1, textAlign: 'center' }]}>
              Week of {shortDate(fromDayKey(start))}
            </Text>
            <IconButton icon="add" label="A week later" onPress={() => step(1)} disabled={start >= last} />
          </View>
        ) : null}
      </View>

      {anyEnding ? (
        <View style={{ gap: Spacing.two }}>
          <Pressable
            onPress={() => setEndCurrent((v) => !v)}
            accessible={false}
            style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.tight }}>
            <Text variant="rowTitle" style={{ flex: 1 }}>
              End {client.first_name}’s current plan
            </Text>
            <Toggle
              value={endCurrent}
              onValueChange={setEndCurrent}
              accessibilityLabel={`End ${client.first_name}’s current plan`}
              testID="give-end-current"
            />
          </Pressable>
          <Text variant="footnote" tone="secondary">
            {endCurrent ? endingWords() : 'What’s on the plan now keeps running alongside this program.'}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: Spacing.two }}>
        <Text variant="callout" style={Tabular}>
          {weeksLabel(program.weeks)} · {shortDate(fromDayKey(start))} to {shortDate(fromDayKey(end))} ·{' '}
          {daysLabelShort(program.days)}
        </Text>
        {alongside.map((a) => (
          <Text key={a.id} variant="footnote" tone="secondary">
            {a.name} from {shortDate(fromDayKey(a.starts_on))} stays on {client.first_name}’s plan and runs alongside
            this one. Take it off on their Plan tab if this replaces it.
          </Text>
        ))}
      </View>

      <View style={{ gap: Spacing.tight }}>
        <ErrorText>{error}</ErrorText>
        <Button title={`Give to ${client.first_name}`} onPress={give} loading={busy} testID="give-confirm" />
      </View>
    </View>
  );
}
