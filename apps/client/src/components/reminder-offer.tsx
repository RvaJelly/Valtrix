import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useToast } from '@/components/toast';
import { Button, Card, EnterUp, IconButton, IconTile, Text } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { askPermission } from '@/lib/notify';
import { closeReminderOffer, leadLabel, refreshReminders, useReminderOffer } from '@/lib/reminders';

// Home's offer of session reminders, once there's a session booked to be reminded about. Turn on is
// what shows the phone's own question, so it comes with a reason and never cold at sign-in.
export function ReminderOffer() {
  const lead = useReminderOffer();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  if (lead === null) return null;
  const before = leadLabel(lead);

  async function turnOn() {
    setAsking(true);
    const granted = await askPermission().catch(() => false);
    await closeReminderOffer();
    setAsking(false);
    if (granted) {
      toast(`Reminders on, ${before} before each session.`);
      refreshReminders();
    } else {
      toast('Reminders stay off. Turn them on any time in Settings › Notifications.');
    }
  }

  return (
    <EnterUp>
      <Card style={{ gap: Spacing.tight }} testID="reminder-offer">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.tight }}>
          <IconTile icon="notifications-outline" />
          <Text variant="headline" style={{ flex: 1 }}>
            Get a reminder before each session
          </Text>
          <IconButton icon="close" label="Not now" onPress={closeReminderOffer} testID="reminder-offer-later" />
        </View>
        <Text variant="callout" tone="secondary">
          {Platform.OS === 'web'
            ? `A notification ${before} before every booked session, while this page is open.`
            : `A notification on this phone ${before} before every booked session.`}
        </Text>
        <Button
          title="Turn on"
          variant="secondary"
          size="medium"
          onPress={turnOn}
          loading={asking}
          style={{ marginTop: Spacing.one }}
          testID="reminder-offer-on"
        />
      </Card>
    </EnterUp>
  );
}
