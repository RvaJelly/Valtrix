import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, ErrorText, Group, IconTile, ListRow, Notice, Skeleton, Text, useDelayed } from '@/components/ui';
import { Colors, Layout, Radius, Spacing, themed } from '@/constants/theme';
import { feedUrl, googleAddUrl, webcalUrl, type CalendarLink } from '@/lib/calendar-link';
import { confirm } from '@/lib/confirm';
import { plainError } from '@/lib/errors';
import { ago } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { callRpc } from '@/lib/rpc';

// Settings, Calendar link: the same page in Voltrix and Voltrix Coach. The person's sessions in
// Google Calendar, Apple Calendar or Outlook through a private link that updates by itself. The link
// is never shown as text; only the buttons use it.

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'failed' } | { kind: 'ready'; link: CalendarLink };

function asLink(data: unknown): CalendarLink {
  const d = (data ?? {}) as Partial<CalendarLink>;
  return { token: d.token ?? null, created_at: d.created_at ?? null, last_used_at: d.last_used_at ?? null };
}

// A new tab may only open straight from the press on the web, before anything is awaited.
function openNow(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else Linking.openURL(url).catch(() => {});
}

export function CalendarLinkPage({ app }: { app: 'coach' | 'client' }) {
  const toast = useToast();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [busy, setBusy] = useState<'get' | 'new' | 'off' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const showSkeleton = useDelayed(300);
  const loads = useRef(0);
  const appName = app === 'coach' ? 'Voltrix Coach' : 'Voltrix';

  // Reads the link without making one. Only the newest read may show its answer.
  const load = useCallback(() => {
    const id = ++loads.current;
    return callRpc<unknown>('calendar_link', { p_make: false }).then(
      (answer) => {
        if (id === loads.current)
          setState(answer.missing ? { kind: 'missing' } : { kind: 'ready', link: asLink(answer.data) });
      },
      () => {
        if (id === loads.current) setState((s) => (s.kind === 'ready' ? s : { kind: 'failed' }));
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

  async function change(which: 'get' | 'new' | 'off') {
    if (busy) return;
    setBusy(which);
    setError(null);
    try {
      const answer =
        which === 'get'
          ? await callRpc<unknown>('calendar_link', { p_make: true })
          : which === 'new'
            ? await callRpc<unknown>('reset_calendar_link')
            : await callRpc<unknown>('calendar_link_off');
      if (answer.missing) {
        setState({ kind: 'missing' });
        return;
      }
      ++loads.current;
      setState({ kind: 'ready', link: asLink(answer.data) });
      if (which === 'off') {
        haptic.select();
        toast('Calendar link turned off');
      } else {
        haptic.success();
        if (which === 'new') toast('New link ready');
      }
    } catch (e) {
      haptic.warning();
      setError(plainError(e));
    } finally {
      setBusy(null);
    }
  }

  async function makeNew() {
    const sure = await confirm(
      'Make a new link?',
      'The old link stops working at once. Add the new one to your calendar again.',
      'Make new link',
    );
    if (sure) change('new');
  }

  async function turnOff() {
    const sure = await confirm('Turn off your calendar link?', 'Calendars using it stop updating.', 'Turn off');
    if (sure) change('off');
  }

  async function copy(token: string) {
    try {
      await Clipboard.setStringAsync(feedUrl(token));
      haptic.select();
      toast('Link copied');
    } catch {
      toast('Couldn’t copy the link. Try again.');
    }
  }

  // webcal:// asks the phone's or computer's calendar app to subscribe.
  function addElsewhere(token: string) {
    Linking.openURL(webcalUrl(token)).catch(() => toast('Copy the link and add it in your calendar app.'));
  }

  let body;
  if (state.kind === 'loading') {
    body = showSkeleton ? (
      <View accessible accessibilityLabel="Loading">
        <Skeleton height={168} radius={Radius.large} />
      </View>
    ) : null;
  } else if (state.kind === 'missing') {
    body = <Notice>This isn’t available yet. It arrives with the next update of {appName}.</Notice>;
  } else if (state.kind === 'failed') {
    body = (
      <Notice tone="danger" action={{ label: 'Try again', onPress: retry, loading: retrying }}>
        Your calendar link couldn’t be loaded.
      </Notice>
    );
  } else if (!state.link.token) {
    body = (
      <Card testID="calendar-off-card">
        <View style={styles.offTop}>
          <IconTile icon="link-outline" />
          <Text variant="callout" style={{ flex: 1 }}>
            See your sessions in Google Calendar, Apple Calendar or Outlook. They update by themselves.
          </Text>
        </View>
        <View style={{ marginTop: Spacing.gutter, gap: Spacing.tight }}>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Get my calendar link"
            onPress={() => change('get')}
            loading={busy === 'get'}
            testID="calendar-get"
          />
        </View>
      </Card>
    );
  } else {
    const token = state.link.token;
    const used = state.link.last_used_at;
    body = (
      <>
        <View style={{ gap: Spacing.tight }}>
          <Group testID="calendar-on">
            <ListRow
              title="Add to Google Calendar"
              leading={<IconTile icon="logo-google" />}
              onPress={() => openNow(googleAddUrl(token))}
              testID="calendar-google"
            />
            <ListRow
              title="Add to Apple Calendar or Outlook"
              titleLines={2}
              leading={<IconTile icon="calendar-outline" />}
              onPress={() => addElsewhere(token)}
              testID="calendar-webcal"
            />
            <ListRow
              title="Copy link"
              leading={<IconTile icon="copy-outline" />}
              onPress={() => copy(token)}
              testID="calendar-copy"
              last
            />
          </Group>
          <Text variant="footnote" tone="secondary">
            It shows as “{appName}” in your calendar app. Anyone with this link can see your session times and places,
            and who each session is with: a first name and, for clients, a last initial. Notes, prices and health
            answers are never in it. Google Calendar can take up to a day to show a change; {appName} always has the
            latest.
            {Platform.OS === 'android'
              ? ' Google opens in your browser. Use the same Google account as your phone’s calendar.'
              : ''}
          </Text>
        </View>
        <View style={{ gap: Spacing.tight }}>
          <Group>
            <ListRow
              title={busy === 'new' ? 'Making a new link…' : 'Make a new link'}
              subtitle="The old link stops working"
              leading={<IconTile icon="refresh-outline" />}
              onPress={makeNew}
              accessibilityState={{ disabled: !!busy }}
              testID="calendar-new"
            />
            <ListRow
              title={busy === 'off' ? 'Turning off…' : 'Turn off'}
              titleTone="danger"
              leading={<IconTile icon="close-circle-outline" color={Colors.danger} />}
              chevron={false}
              onPress={turnOff}
              accessibilityState={{ disabled: !!busy }}
              testID="calendar-off"
              last
            />
          </Group>
          <ErrorText>{error}</ErrorText>
          {used ? (
            <Text variant="footnote" tone="secondary">
              Last used by a calendar app {ago(new Date(used))}.
            </Text>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>{body}</ScrollView>
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
    maxWidth: Layout.maxForm,
    alignSelf: 'center',
    paddingHorizontal: Spacing.gutter,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.hero,
    gap: Spacing.section,
  },
  offTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
  },
}));
