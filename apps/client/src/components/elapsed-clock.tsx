import { useEffect, useState } from 'react';

import { Text } from '@/components/ui';
import { Fonts, Spacing, Tabular } from '@/constants/theme';

function elapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes).padStart(2, '0')}:${seconds}`;
}

// How long the workout has been going, in the header: 'mm:ss', or 'h:mm:ss' from an hour.
// It ticks on its own, so the workout screen itself doesn't redraw every second.
export function ElapsedClock({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <Text
      variant="callout"
      tone="secondary"
      style={[Tabular, { fontFamily: Fonts.textMedium, marginRight: Spacing.two }]}
      accessibilityLabel="Time so far">
      {elapsed(now - startedAt)}
    </Text>
  );
}
