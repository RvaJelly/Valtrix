import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { EnterUp, Notice } from '@/components/ui';
import { answerLine } from '@/lib/book-times';
import { useChatEvents } from '@/lib/chat-live';
import { shortDate, time24 } from '@/lib/format';
import { loadNews, markSeen, type News, type NewsKind } from '@/lib/news';

const KINDS: NewsKind[] = ['booking_answered', 'training_answered'];

// A trainer's answer, shown once: the newest unseen answer to a time the person asked for or to their
// request to train. It is marked seen as soon as it shows and stays until the screen is left or its
// action is used; the next unseen one shows the next time. `place` is where it sits: on Plan › Sessions
// an approved time needs no "See sessions".
export function AnswerNotice({ place, testID }: { place: 'home' | 'plan'; testID: string }) {
  const [shown, setShown] = useState<News | null>(null);
  const current = useRef<News | null>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [top] = await loadNews({ kinds: KINDS, unseen: true, limit: 5 });
      if (!top || !focused.current || current.current) return;
      current.current = top;
      setShown(top);
      // Shown once: the answer is seen now, whatever happens next.
      markSeen([top.id]).catch(() => {});
    } catch {
      // An answer that can't load now shows the next time.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      load();
      return () => {
        focused.current = false;
        current.current = null;
        setShown(null);
      };
    }, [load]),
  );

  // A trainer answered while the screen is open: show it, a second after the news stops.
  useChatEvents((event) => {
    if (event.type !== 'news' || !KINDS.includes(event.kind as NewsKind)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      load();
    }, 1000);
  });
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!shown) return null;
  const p = shown.payload;
  const first = (typeof p.trainer_name === 'string' && p.trainer_name.trim().split(/\s+/)[0]) || 'Your trainer';
  const trainer = typeof p.trainer_id === 'string' ? p.trainer_id : null;
  const at = typeof p.starts_at === 'string' ? new Date(p.starts_at) : null;
  const when = at ? `${shortDate(at)} at ${time24(at)}` : 'that time';
  const yes = shown.kind === 'booking_answered' ? p.approved === true : p.accepted === true;

  function done() {
    current.current = null;
    setShown(null);
  }

  let action: { label: string; onPress: () => void } | undefined;
  if (shown.kind === 'booking_answered') {
    if (yes && place === 'home') {
      action = {
        label: 'See sessions',
        onPress: () => {
          done();
          router.navigate({ pathname: '/plan', params: { view: 'sessions' } });
        },
      };
    } else if (!yes && trainer) {
      action = {
        label: 'Book',
        onPress: () => {
          done();
          router.push({ pathname: '/book', params: { trainer } });
        },
      };
    }
  } else if (!yes) {
    action = {
      label: 'Trainers',
      onPress: () => {
        done();
        router.push('/trainers');
      },
    };
  }

  return (
    <EnterUp>
      <View testID={testID}>
        <Notice tone={yes ? 'success' : 'neutral'} action={action}>
          {answerLine(shown.kind as 'booking_answered' | 'training_answered', p, first, when)}
        </Notice>
      </View>
    </EnterUp>
  );
}
