import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { InviteSheet, type InviteClient } from '@/components/invite-sheet';
import { MarkPaidSheet } from '@/components/mark-paid-sheet';
import { NeedsYouRow } from '@/components/needs-you-row';
import { SellPackSheet } from '@/components/sell-pack-sheet';
import { EmptyState, Group, Notice, Section, SkeletonRows, useDelayed } from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/money';
import { NEED_KINDS, NEED_TITLES, NEEDS_EMPTY, needsYouAll, type Need, type NeedKind } from '@/lib/needs-you';
import { loadOverview } from '@/lib/overview';
import { dayKey } from '@/lib/sessions';

// Every reason every active client needs the trainer, grouped by reason. A client can be under
// two headings. Home shows the first five, one per client.
export default function NeedsYou() {
  const { profile } = useAuth();
  const currency = profile?.currency ?? 'ZAR';
  const [paying, setPaying] = useState<Need | null>(null);
  const [selling, setSelling] = useState<Need | null>(null);
  const [all, setAll] = useState<Record<NeedKind, Need[]> | null>(null);
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [inviting, setInviting] = useState<InviteClient | null>(null);
  const loads = useRef(0);
  const showSkeleton = useDelayed(300);

  const load = useCallback(async () => {
    const id = ++loads.current;
    const now = new Date();
    try {
      const rows = await loadOverview(dayKey(now));
      if (id !== loads.current) return;
      setFailed(false);
      setAll(needsYouAll(rows ?? [], dayKey(now), now.getTime(), (cents) => formatMoney(cents, currency)));
    } catch {
      if (id === loads.current) setFailed(true);
    }
  }, [currency]);

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

  function invite(need: Need) {
    const c = need.client;
    setInviting({
      id: c.client_id,
      first_name: c.first_name,
      email: c.email,
      phone: c.phone,
      app_status: c.app_status,
    });
  }

  const kinds = all ? NEED_KINDS.filter((k) => all[k].length) : [];
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {failed ? (
          <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
            {all ? 'Couldn’t refresh the list.' : 'The list couldn’t be loaded.'}
          </Notice>
        ) : null}
        {!all ? (
          showSkeleton && !failed ? (
            <SkeletonRows count={6} avatar />
          ) : null
        ) : kinds.length ? (
          <View testID="needs-you-all" style={{ gap: Spacing.section }}>
            {kinds.map((kind) => (
              <Section key={kind} title={NEED_TITLES[kind]}>
                <Group>
                  {all[kind].map((need, i) => (
                    <NeedsYouRow
                      key={need.client.client_id}
                      need={need}
                      last={i === all[kind].length - 1}
                      onInvite={invite}
                      onSell={setSelling}
                      onPaid={setPaying}
                    />
                  ))}
                </Group>
              </Section>
            ))}
          </View>
        ) : (
          <EmptyState icon="checkmark-done-outline" title="Everyone’s on track" message={NEEDS_EMPTY} />
        )}
      </ScrollView>
      <InviteSheet client={inviting} onClose={() => setInviting(null)} onShared={load} onConnected={load} />
      <MarkPaidSheet
        clientId={paying?.client.client_id ?? null}
        first={paying?.client.first_name ?? ''}
        onClose={() => setPaying(null)}
        onDone={load}
      />
      <SellPackSheet
        clientId={selling?.client.client_id ?? null}
        first={selling?.client.first_name ?? ''}
        clientPriceCents={selling?.client.session_price_cents ?? null}
        onClose={() => setSelling(null)}
        onSold={load}
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
