import { View } from 'react-native';

import { CalendarLinkPage } from '@/components/calendar-link-page';
import { SettingsPage } from '@/components/settings-parts';
import { Notice } from '@/components/ui';
import { useAuth } from '@/lib/auth';

// Settings › Calendar link: the person's sessions in their own calendar app, as "Training with {first}".
// A trainer signed in here has one link, the one in Voltrix Coach (it holds their clients' sessions and
// their own training), so it is managed there: a new link or Turn off here would change it in Coach too.
export default function CalendarLinkSettings() {
  const { profile } = useAuth();
  if (profile?.role === 'trainer') {
    return (
      <SettingsPage>
        <View testID="calendar-in-coach">
          <Notice>
            Your calendar link is in Voltrix Coach, with your clients’ sessions and your own training. Add it, make a
            new one or turn it off there, under {'Settings\u00a0›\u00a0Calendar\u00a0link'}.
          </Notice>
        </View>
      </SettingsPage>
    );
  }
  return <CalendarLinkPage app="client" />;
}
