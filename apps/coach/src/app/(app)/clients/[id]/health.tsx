import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { DoctorOkSheet } from '@/components/doctor-ok-sheet';
import {
  Button,
  Card,
  EmptyState,
  Group,
  IconButton,
  ListRow,
  Notice,
  PageHeader,
  Section,
  Skeleton,
  SkeletonRows,
  StatusPill,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { useChatEvents } from '@/lib/chat-live';
import { loadClientForm, loadQuestions } from '@/lib/client-health';
import { fullName } from '@/lib/clients';
import { dayMonth } from '@/lib/format';
import { healthState, type HealthForm, type HealthQuestion } from '@/lib/health';
import { loadOverview } from '@/lib/overview';
import { dayFromKey, HOME_ZONE, zonedParts } from '@/lib/zones';

type Data = {
  first_name: string;
  last_name: string | null;
  linked: boolean;
  doctor_ok_on: string | null;
  form: HealthForm | null;
  questions: HealthQuestion[];
};

// A client's health form as they filled it in in Voltrix (only while the trainer coaches them), and
// the trainer's note of their doctor's OK.
export default function ClientHealth() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const zone = profile?.time_zone || HOME_ZONE;
  const today = zonedParts(new Date(), zone).day;
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [okOpen, setOkOpen] = useState(false);
  const showSkeleton = useDelayed(300);
  const loads = useRef(0);

  const load = useCallback(() => {
    const n = ++loads.current;
    return Promise.all([loadOverview(today, id), loadClientForm(id)])
      .then(async ([rows, form]) => {
        const questions = form ? ((await loadQuestions(form.version)) ?? []) : [];
        return { row: rows?.[0] ?? null, form, questions };
      })
      .then(
        ({ row, form, questions }) => {
          if (n !== loads.current) return;
          if (!row) return setFailed(true);
          setFailed(false);
          setData({
            first_name: row.first_name,
            last_name: row.last_name,
            linked: row.linked,
            doctor_ok_on: row.doctor_ok_on,
            form,
            questions,
          });
        },
        () => {
          if (n === loads.current) setFailed(true);
        },
      );
  }, [id, today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const [news, setNews] = useState(0);
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(load, 1000);
    return () => clearTimeout(timer);
  }, [load, news]);
  useChatEvents((event) => {
    if (event.type === 'news' && event.kind === 'health' && event.client_id === id) setNews((n) => n + 1);
  });

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  const header = (
    <>
      <Stack.Screen options={{ title: 'Health form', headerTitle: '' }} />
      <PageHeader eyebrow={data ? fullName(data) : ' '} title="Health form" />
    </>
  );

  if (!data) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content}>
          {header}
          {failed ? (
            <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
              The health form couldn’t be loaded.
            </Notice>
          ) : showSkeleton ? (
            <>
              <Skeleton height={96} radius={20} />
              <SkeletonRows count={8} />
            </>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  const first = data.first_name;
  const form = data.form;
  const signedDay = form ? zonedParts(new Date(form.signed_at), zone).day : null;
  const changedDay = form ? zonedParts(new Date(form.updated_at), zone).day : null;
  const state = form && signedDay ? healthState(form, signedDay, data.doctor_ok_on) : null;
  const yes = form ? data.questions.filter((q) => form.answers[q.key] === true) : [];
  const no = form ? data.questions.filter((q) => form.answers[q.key] !== true) : [];
  const signedAgain =
    form?.needs_doctor && data.doctor_ok_on && signedDay && data.doctor_ok_on < signedDay ? signedDay : null;

  const doctorOk = (
    <Section title="Doctor’s OK">
      <Group>
        <ListRow
          title="Doctor said it’s OK"
          trailing={
            <Text variant="callout" tone={data.doctor_ok_on ? 'primary' : 'secondary'}>
              {data.doctor_ok_on ? dayMonth(dayFromKey(data.doctor_ok_on)) : 'Add the date'}
            </Text>
          }
          onPress={() => setOkOpen(true)}
          testID="health-doctor-ok"
          last
        />
      </Group>
    </Section>
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {header}
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            Couldn’t refresh the health form.
          </Notice>
        ) : null}

        {form && state ? (
          <>
            <Card style={{ gap: Spacing.two }}>
              <View style={{ alignItems: 'flex-start' }}>
                <StatusPill
                  tone={state === 'doctor' ? 'warning' : 'success'}
                  label={
                    state === 'doctor' ? 'Check with a doctor' : state === 'doctor_ok' ? 'Doctor’s OK' : 'No flags'
                  }
                  testID="health-pill"
                />
              </View>
              <Text variant="footnote" tone="secondary">
                {`Signed by ${form.signed_name} on ${dayMonth(dayFromKey(signedDay!))}${
                  changedDay && changedDay !== signedDay ? ` · changed ${dayMonth(dayFromKey(changedDay))}` : ''
                }`}
              </Text>
              {signedAgain ? (
                <Text variant="footnote" tone="secondary">
                  {`Signed again on ${dayMonth(dayFromKey(signedAgain))} after the doctor’s OK.`}
                </Text>
              ) : null}
            </Card>

            {yes.length ? (
              <Section title="Answered yes">
                <Group>
                  {yes.map((q, i) => (
                    <ListRow
                      key={q.key}
                      title={q.question}
                      titleLines={4}
                      status={<StatusPill tone="warning" label="Yes" />}
                      last={i === yes.length - 1}
                    />
                  ))}
                </Group>
              </Section>
            ) : null}
            {no.length ? (
              <Section title="Answered no">
                <Group>
                  {no.map((q, i) => (
                    <ListRow
                      key={q.key}
                      title={q.question}
                      titleLines={4}
                      trailing={
                        <Text variant="callout" tone="secondary">
                          No
                        </Text>
                      }
                      last={i === no.length - 1}
                    />
                  ))}
                </Group>
              </Section>
            ) : null}
            {form.details ? (
              <Section title="Anything else">
                <Card>
                  <Text variant="callout">{`“${form.details}”`}</Text>
                </Card>
              </Section>
            ) : null}
            {form.emergency_name || form.emergency_phone ? (
              <Section title="Emergency contact">
                <Group>
                  <ListRow
                    title={[form.emergency_name, form.emergency_phone].filter(Boolean).join(' · ')}
                    titleLines={2}
                    trailing={
                      form.emergency_phone ? (
                        <IconButton
                          icon="call-outline"
                          label={`Call ${form.emergency_name ?? form.emergency_phone}`}
                          onPress={() =>
                            Linking.openURL(`tel:${form.emergency_phone!.replace(/\s+/g, '')}`).catch(() => {})
                          }
                        />
                      ) : null
                    }
                    last
                  />
                </Group>
              </Section>
            ) : null}
            {doctorOk}
            <Text variant="footnote" tone="secondary">
              {`This is ${first}’s own answer, not medical advice. Ask ${first} what their doctor said before training hard.`}
            </Text>
          </>
        ) : data.linked ? (
          <>
            <EmptyState
              icon="medkit-outline"
              title="No health form yet"
              message={`${first} fills it in once in Voltrix, and you see it here.`}
              action={
                <Button
                  title={`Message ${first}`}
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id, name: first } })}
                />
              }
            />
            {doctorOk}
          </>
        ) : (
          <>
            {doctorOk}
            <Text variant="footnote" tone="secondary">
              Health forms come from the Voltrix app.
            </Text>
          </>
        )}
      </ScrollView>

      <DoctorOkSheet
        visible={okOpen}
        clientId={id}
        first={first}
        from={signedDay ?? '2020-01-01'}
        value={data.doctor_ok_on}
        onClose={() => setOkOpen(false)}
        onSaved={(day) => setData((d) => (d ? { ...d, doctor_ok_on: day } : d))}
      />
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
    maxWidth: Layout.maxCoach,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
}));
