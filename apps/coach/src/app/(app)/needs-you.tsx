import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { InviteSheet, type InviteClient } from '@/components/invite-sheet';
import { NeedsYouRow } from '@/components/needs-you-row';
import { EmptyState, Group, Notice, Section, SkeletonRows, useDelayed } from '@/components/ui';
import { Colors, Layout, Spacing, themed } from '@/constants/theme';
import { NEED_KINDS, NEED_TITLES, needsYouAll, type Need, type NeedKind } from '@/lib/needs-you';
import { loadOverview } from '@/lib/overview';
import { dayKey } from '@/lib/sessions';

// Every reason every active client needs the trainer, grouped by reason. A client can be under
// two headings. Home shows the first five, one per client.
export default function NeedsYou() {
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
      setAll(needsYouAll(rows ?? [], dayKey(now), now.getTime()));
    } catch {
      if (id === loads.current) setFailed(true);
    }
  }, []);

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
                    />
                  ))}
                </Group>
              </Section>
            ))}
          </View>
        ) : (
          <EmptyState
            icon="checkmark-done-outline"
            title="Everyone’s on track"
            message="Check-ins to answer, clients who go quiet and open invites show here."
          />
        )}
      </ScrollView>
      <InviteSheet client={inviting} onClose={() => setInviting(null)} onShared={load} onConnected={load} />
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
