import { router } from 'expo-router';
import { View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { RowWithAction } from '@/components/row-action';
import { Button, IconButton, ListRow } from '@/components/ui';
import { Spacing, themed } from '@/constants/theme';
import { fullName } from '@/lib/clients';
import type { Need } from '@/lib/needs-you';

// One client who needs the trainer: who, and why. The row opens the right place on their page; a
// button at the end (its own button, beside the row's) opens a chat, the WhatsApp invite, Sell a
// pack or Mark paid.
export function NeedsYouRow({
  need,
  last,
  onInvite,
  onSell,
  onPaid,
}: {
  need: Need;
  last?: boolean;
  onInvite: (need: Need) => void;
  onSell: (need: Need) => void;
  onPaid: (need: Need) => void;
}) {
  const c = need.client;
  const name = fullName(c);
  const id = c.client_id;
  if (need.trailing === 'sell' || need.trailing === 'paid') {
    const sell = need.trailing === 'sell';
    return (
      <RowWithAction
        title={name}
        subtitle={need.subtitle}
        subtitleLines={2}
        leading={<Avatar name={name} size={40} />}
        onPress={() => router.push(need.href)}
        accessibilityLabel={`${name}, ${need.subtitle}`}
        testID={`needs-you-${id}`}
        last={last}
        action={
          <Button
            title={sell ? 'Sell' : 'Mark paid'}
            variant="secondary"
            size="small"
            onPress={() => (sell ? onSell(need) : onPaid(need))}
            accessibilityLabel={sell ? `Sell ${c.first_name} a pack` : `Mark ${c.first_name} paid`}
            testID={sell ? `needs-sell-${id}` : `needs-paid-${id}`}
          />
        }
      />
    );
  }
  return (
    <View>
      <ListRow
        title={name}
        subtitle={need.subtitle}
        subtitleLines={2}
        leading={<Avatar name={name} size={40} />}
        // Room for the button, which sits over this spot as its own button.
        trailing={need.trailing ? <View style={styles.room} /> : null}
        chevron={!need.trailing}
        onPress={() => router.push(need.href)}
        accessibilityLabel={`${name}, ${need.subtitle}`}
        testID={`needs-you-${id}`}
        last={last}
      />
      {need.trailing ? (
        <View style={styles.action} pointerEvents="box-none">
          {need.trailing === 'message' ? (
            <IconButton
              icon="chatbubble-outline"
              tone="secondary"
              label={`Message ${c.first_name}`}
              testID={`needs-you-action-${id}`}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id, name } })}
            />
          ) : (
            <IconButton
              icon="logo-whatsapp"
              tone="secondary"
              label={`Invite ${c.first_name} on WhatsApp`}
              testID={`needs-you-action-${id}`}
              onPress={() => onInvite(need)}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => ({
  room: {
    width: 44,
    height: 44,
  },
  // Over the row's last 44, lined up with its right edge.
  action: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: Spacing.gutter,
    justifyContent: 'center',
  },
}));
