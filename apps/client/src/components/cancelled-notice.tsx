import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { EnterUp, Notice } from '@/components/ui';
import { shortDate, time24 } from '@/lib/format';
import { trainerName, type Session } from '@/lib/sessions';

// The cancelled sessions this phone has told the person about, by id.
const SEEN_KEY = 'voltrix.cancelledSeen';

async function loadTold(): Promise<string[]> {
  try {
    const list: unknown = JSON.parse((await AsyncStorage.getItem(SEEN_KEY)) ?? '[]');
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

// Sessions a trainer cancelled that are still to come, told once on Home, so nobody sets off for a
// session that no longer happens. `sessions` is every such session Home loaded. Like a trainer's
// answer, it is told as soon as it shows and stays until Home is left.
export function CancelledNotice({ sessions, testID }: { sessions: Session[] | null; testID: string }) {
  const [shown, setShown] = useState<Session[] | null>(null);
  const focused = useRef(false);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
        setShown(null);
      };
    }, []),
  );

  useEffect(() => {
    if (!sessions?.length || shown) return;
    let alive = true;
    loadTold().then((told) => {
      const fresh = sessions.filter((s) => !told.includes(s.id));
      if (!alive || !focused.current || !fresh.length) return;
      setShown([...fresh].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)));
      // Every one in the list has now been told; sessions that have passed drop out of it.
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(sessions.map((s) => s.id))).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, [sessions, shown]);

  if (!shown?.length) return null;
  const firstOne = shown[0];
  const at = new Date(firstOne.starts_at);
  const when = `${shortDate(at)} at ${time24(at)}`;
  const names = new Set(shown.map((s) => trainerName(s).split(' ')[0]));
  const who = names.size === 1 ? [...names][0] : 'Your trainers';
  const words =
    shown.length === 1
      ? `${who} cancelled your session on ${when}.`
      : `${who} cancelled ${shown.length} of your sessions, the first on ${when}.`;

  return (
    <EnterUp>
      <View testID={testID}>
        <Notice
          action={{
            label: 'See sessions',
            onPress: () => {
              setShown(null);
              router.navigate({ pathname: '/plan', params: { view: 'sessions' } });
            },
          }}>
          {words}
        </Notice>
      </View>
    </EnterUp>
  );
}
