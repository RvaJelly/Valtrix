import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { useChatEvents, type ProgressKind } from '@/lib/chat-live';
import { useRefreshOnReturn } from '@/lib/refresh-on-return';

// Loads one part of a client's page (their workouts, progress or habits) and keeps it fresh:
// each time the page shows, when the app or browser window comes back, when the connection is
// back, and a second after the client saves something of these kinds (a burst of news gives
// one reload). A reload never blanks what is on screen, and a failed one keeps it, so a reply
// being typed is never lost and the page doesn't jump. A newer load marks the older one dead,
// so an older answer never shows over a newer one.
export function useClientData<T>(
  clientId: string,
  load: (clientId: string) => Promise<T>,
  kinds: readonly ProgressKind[],
  // How a reload's answer joins what is on screen (for example older pages kept).
  merge?: (old: T | null, next: T) => T,
) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const [news, setNews] = useState(0);
  const again = useCallback(() => setVersion((v) => v + 1), []);

  // Each time the page shows, load again. The load waits for that first showing.
  useFocusEffect(again);

  useEffect(() => {
    if (!version) return;
    let alive = true;
    load(clientId).then(
      (next) => {
        if (!alive) return;
        setData((old) => (merge ? merge(old, next) : next));
        setFailed(false);
      },
      () => {
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [clientId, load, merge, version]);
  useRefreshOnReturn(again);

  // Reload once, a second after the last news of a burst.
  useEffect(() => {
    if (!news) return;
    const timer = setTimeout(again, 1000);
    return () => clearTimeout(timer);
  }, [news, again]);

  useChatEvents((event) => {
    if (event.type === 'reconnected') again();
    else if (event.type === 'progress' && event.client_id === clientId && kinds.includes(event.kind)) {
      setNews((n) => n + 1);
    }
  });

  return { data, setData, failed, again };
}
