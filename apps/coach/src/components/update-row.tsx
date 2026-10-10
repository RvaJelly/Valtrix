import type { Href } from 'expo-router';
import { View } from 'react-native';

import { IconTile, ListRow, StatusDot, StatusPill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { shortDate, time24 } from '@/lib/format';
import type { News } from '@/lib/news';
import { updateIcon, updateLine } from '@/lib/update-words';

// The client's first name for a piece of news: from the trainer's clients when known, else the name
// the news was kept with.
export function newsFirst(n: News, names: Map<string, string>): string {
  const known = n.client_id ? names.get(n.client_id) : undefined;
  if (known) return known;
  const kept = typeof n.payload.name === 'string' ? n.payload.name.trim() : '';
  return kept.split(/\s+/)[0] || 'A client';
}

// "Mon 12 Oct, 07:00" for news about a time, else ''. The day never breaks across lines.
export function newsWhen(n: News, joiner = ', '): string {
  const at = typeof n.payload.starts_at === 'string' ? new Date(n.payload.starts_at) : null;
  return at && !Number.isNaN(at.getTime()) ? `${shortDate(at).replace(/ /g, '\u00a0')}${joiner}${time24(at)}` : '';
}

// Where a piece of news leads: the session booked or cancelled, or the client's health form. Requests
// open their sheet on the page that shows them instead.
export function newsTarget(n: News): Href | null {
  if ((n.kind === 'booked' || n.kind === 'cancelled') && typeof n.payload.session_id === 'string')
    return { pathname: '/sessions/[id]', params: { id: n.payload.session_id } };
  if (n.kind === 'health' && n.client_id) return { pathname: '/clients/[id]/health', params: { id: n.client_id } };
  return null;
}

// The health updates that carry "Check with a doctor": the newest one in the list for each client whose
// form needs a doctor's OK now. That comes from clients_overview while the trainer coaches them, never
// from the news, which keeps only whether the form was filled in, changed or removed.
export function doctorUpdates(list: News[], health: Map<string, string | null>): Set<string> {
  const clients = new Set<string>();
  const ids = new Set<string>();
  for (const n of list) {
    if (n.kind !== 'health' || !n.client_id || clients.has(n.client_id)) continue;
    clients.add(n.client_id);
    if (n.payload.change !== 'delete' && health.get(n.client_id) === 'doctor') ids.add(n.id);
  }
  return ids;
}

// One update, as on Home and the Updates page. `fresh` marks it unseen with a "New" dot; `doctor` adds
// the "Check with a doctor" pill to a health update (see doctorUpdates).
export function UpdateRow({
  news,
  first,
  fresh,
  doctor,
  onPress,
  last,
  testID,
}: {
  news: News;
  first: string;
  fresh?: boolean;
  doctor?: boolean;
  onPress?: () => void;
  last?: boolean;
  testID?: string;
}) {
  const title = updateLine(news.kind, news.payload, first, newsWhen(news));
  // A cancelled session that was paid for: the trainer refunds it or keeps it as credit.
  const paid = news.kind === 'cancelled' && news.payload.paid === true;
  const pill = news.kind === 'health' && doctor ? 'Check with a doctor' : paid ? 'Paid already' : null;
  return (
    <ListRow
      title={title}
      titleLines={2}
      leading={<IconTile icon={updateIcon(news.kind)} />}
      // The pill sits under the words, so the line itself never has to shorten for it.
      subtitle={
        pill ? (
          <View style={{ alignItems: 'flex-start', marginTop: Spacing.one }}>
            <StatusPill tone="warning" label={pill} />
          </View>
        ) : undefined
      }
      status={fresh ? <StatusDot tone="neutral" label="New" /> : null}
      onPress={onPress}
      chevron={!!onPress}
      accessibilityLabel={`${fresh ? 'New: ' : ''}${title}${pill ? `, ${pill.toLowerCase()}` : ''}`}
      testID={testID}
      last={last}
      compact
    />
  );
}
