import { useState } from 'react';

import { Chips } from '@/components/chips';
import { DayPickSheet } from '@/components/day-pick-sheet';
import { dayMonthShort } from '@/lib/format';
import { addDaysKey, dayFromKey } from '@/lib/zones';

// "Paid on": Today, Yesterday or a day picked from a month (from `from` to today). `day` and `today`
// are 'YYYY-MM-DD' on the trainer's clock.
export function PaidOn({
  day,
  today,
  onChange,
  from = '2020-01-01',
  title = 'Paid on',
  background,
  testIDPrefix,
}: {
  day: string;
  today: string;
  onChange: (day: string) => void;
  from?: string;
  title?: string;
  background?: string;
  testIDPrefix?: string;
}) {
  const [picking, setPicking] = useState(false);
  const yesterday = addDaysKey(today, -1);
  const choice = day === today ? 'today' : day === yesterday ? 'yesterday' : 'pick';
  return (
    <>
      <Chips
        options={{
          today: 'Today',
          yesterday: 'Yesterday',
          pick: choice === 'pick' ? dayMonthShort(dayFromKey(day)) : 'Pick a day',
        }}
        value={choice}
        onChange={(v) => {
          if (v === 'today') onChange(today);
          else if (v === 'yesterday') onChange(yesterday);
          else if (v === 'pick') setPicking(true);
        }}
        wrap
        background={background}
        testIDPrefix={testIDPrefix}
      />
      <DayPickSheet
        visible={picking}
        title={title}
        from={from}
        to={today}
        value={day}
        onPick={(d) => {
          onChange(d);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
      />
    </>
  );
}
