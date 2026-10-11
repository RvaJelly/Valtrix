import { useEffect, useState } from 'react';

import { Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';

// Whether the person has a trainer who can see what they log (a trainer who archived them doesn't):
// undefined while it loads, null when it can't be told (no signal).
export function useHasTrainer(): boolean | null | undefined {
  const [has, setHas] = useState<boolean | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    supabase.rpc('my_trainers').then(
      ({ data, error }) => {
        if (alive) setHas(error ? null : Array.isArray(data) && data.length > 0);
      },
      () => {
        if (alive) setHas(null);
      },
    );
    return () => {
      alive = false;
    };
  }, []);
  return has;
}

// The line under what the person logs, saying who sees it: their trainers, or only them until they
// have one. Nothing while that loads; when it can't be told, it says their trainers can see it, so it
// never promises more privacy than there is.
export function SeenBy({ trainer, photos }: { trainer: boolean | null | undefined; photos?: boolean }) {
  if (trainer === undefined) return null;
  const words =
    trainer === false
      ? photos
        ? 'Only you can see these. When you have a trainer, they’ll see them too.'
        : 'Only you can see this. When you have a trainer, they’ll see it too.'
      : photos
        ? 'Only you and your trainers can see these.'
        : 'Your trainers can see this.';
  return (
    <Text variant="footnote" tone="secondary" testID="seen-by">
      {words}
    </Text>
  );
}
