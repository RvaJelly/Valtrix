import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { MarkPaidSheet } from '@/components/mark-paid-sheet';
import { RowWithAction } from '@/components/row-action';
import {
  Button,
  Card,
  EmptyState,
  Group,
  Notice,
  PageHeader,
  Skeleton,
  SkeletonRows,
  Text,
  useDelayed,
} from '@/components/ui';
import { Colors, Layout, Spacing, Tabular, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { fullName } from '@/lib/clients';
import { formatMoney } from '@/lib/money';
import { loadOverview, type ClientOverview } from '@/lib/overview';
import { itemCount, owedWords } from '@/lib/paid';
import { HOME_ZONE, zonedParts } from '@/lib/zones';

// Who owes you: every client with sessions done or packs not marked paid, the longest waiting first.
export default function WhoOwes() {
  const { profile } = useAuth();
  const currency = profile?.currency ?? 'ZAR';
  const today = zonedParts(new Date(), profile?.time_zone || HOME_ZONE).day;
  const [rows, setRows] = useState<ClientOverview[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [marking, setMarking] = useState<ClientOverview | null>(null);
  const showSkeleton = useDelayed(300);
  const loads = useRef(0);

  const load = useCallback(() => {
    const n = ++loads.current;
    return loadOverview(today).then(
      (found) => {
        if (n !== loads.current) return;
        setFailed(false);
        setRows(
          (found ?? [])
            .filter((r) => r.owed_cents > 0 || r.owed_other)
            .sort((a, b) => ((a.owed_since ?? '9') < (b.owed_since ?? '9') ? -1 : 1)),
        );
      },
      () => {
        if (n === loads.current) setFailed(true);
      },
    );
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  const total = (rows ?? []).reduce((sum, r) => sum + r.owed_cents, 0);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Who owes you', headerTitle: '' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <PageHeader title="Who owes you" />
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {rows ? 'Couldn’t refresh who owes you.' : 'Who owes you couldn’t be loaded.'}
          </Notice>
        ) : null}
        {!rows ? (
          showSkeleton && !failed ? (
            <>
              <Skeleton height={110} radius={20} />
              <SkeletonRows count={4} avatar />
            </>
          ) : null
        ) : rows.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Everyone’s paid up"
            message="Sessions done and packs that aren’t marked paid show here."
          />
        ) : (
          <>
            <Card hero style={{ gap: Spacing.two }}>
              <Text variant="label" tone="secondary">
                Owed to you
              </Text>
              <Text variant="stat" style={Tabular}>
                {formatMoney(total, currency)}
              </Text>
              <Text variant="footnote" tone="secondary">
                {rows.length === 1 ? '1 client' : `${rows.length} clients`}
              </Text>
            </Card>
            <View testID="owed-list">
              <Group>
                {rows.map((r, i) => {
                  const name = fullName(r);
                  return (
                    <RowWithAction
                      key={r.client_id}
                      title={name}
                      // Count first, as on the client's page; a count never breaks from its word.
                      subtitle={owedWords(itemCount(r.owed_count), r.owed_since, r.owed_other)}
                      subtitleLines={2}
                      leading={<Avatar name={name} size={40} />}
                      stacked
                      before={
                        <Text variant="callout" style={Tabular}>
                          {formatMoney(r.owed_cents, currency)}
                        </Text>
                      }
                      action={
                        <Button
                          title="Mark paid"
                          variant="secondary"
                          size="small"
                          onPress={() => setMarking(r)}
                          accessibilityLabel={`Mark ${name} paid`}
                          testID={`owed-paid-${r.client_id}`}
                        />
                      }
                      onPress={() => router.push({ pathname: '/clients/[id]/money', params: { id: r.client_id } })}
                      accessibilityLabel={`${name} owes ${formatMoney(r.owed_cents, currency)}. Open their money page`}
                      last={i === rows.length - 1}
                    />
                  );
                })}
              </Group>
            </View>
          </>
        )}
      </ScrollView>
      <MarkPaidSheet
        clientId={marking?.client_id ?? null}
        first={marking?.first_name ?? ''}
        onClose={() => setMarking(null)}
        onDone={load}
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
