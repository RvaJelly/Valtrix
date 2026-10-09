import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { Colors, Spacing, themed } from '@/constants/theme';
import { APP_STATUS_LABELS, type AppStatus } from '@/lib/clients';

const ICONS: Record<AppStatus, ComponentProps<typeof Ionicons>['name']> = {
  not_on_app: 'phone-portrait-outline',
  invited: 'mail-unread-outline',
  declined: 'close-circle-outline',
  joined: 'checkmark-circle',
  left: 'exit-outline',
};

function colorOf(status: AppStatus) {
  if (status === 'joined') return Colors.accentText;
  if (status === 'declined' || status === 'left') return Colors.danger;
  if (status === 'invited') return Colors.text;
  return Colors.textSecondary;
}

// Where a client is with the Voltrix app, in plain words: "Invite waiting", "Joined"...
export function AppStatusLabel({ status, size = 13 }: { status: AppStatus; size?: number }) {
  const color = colorOf(status);
  return (
    <View style={styles.row}>
      <Ionicons name={ICONS[status]} size={size + 3} color={color} />
      <Text style={[styles.text, { color, fontSize: size }]}>{APP_STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  text: {
    fontWeight: '700',
  },
}));
