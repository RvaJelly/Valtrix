import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';

import { confirm } from '@/lib/confirm';

// While `active`, leaving the screen (back, swipe, header button) asks first. On the web a reload or
// the browser's own back button isn't asked about.
export function useLeaveGuard(active: boolean, message = 'Your changes aren’t saved.') {
  const navigation = useNavigation();
  usePreventRemove(active, ({ data }) => {
    confirm('Leave without saving?', message, 'Leave').then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });
}
