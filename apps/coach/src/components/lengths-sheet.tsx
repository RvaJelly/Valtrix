import { Sheet } from '@/components/sheet';
import { Button, Group, ListRow, Text, Toggle } from '@/components/ui';
import { Colors } from '@/constants/theme';
import { LENGTH_CHOICES } from '@/lib/booking-rules';

// The session lengths clients can book: a Toggle each, at least one on. Kept shortest first, so the
// first one on is what clients see first.
export function LengthsSheet({
  visible,
  lengths,
  onChange,
  onClose,
}: {
  visible: boolean;
  lengths: number[];
  onChange: (lengths: number[]) => void;
  onClose: () => void;
}) {
  const choices = [...new Set([...LENGTH_CHOICES, ...lengths])].sort((a, b) => a - b);
  const onlyOne = lengths.length === 1;

  function flip(minutes: number, on: boolean) {
    const next = on ? [...lengths, minutes] : lengths.filter((m) => m !== minutes);
    if (!next.length) return;
    onChange([...new Set(next)].sort((a, b) => a - b));
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Session lengths">
      <Group style={{ backgroundColor: Colors.tint }}>
        {choices.map((minutes, i) => {
          const on = lengths.includes(minutes);
          return (
            <ListRow
              key={minutes}
              title={`${minutes} min`}
              trailing={
                <Toggle
                  accessibilityLabel={`${minutes} minutes`}
                  value={on}
                  onValueChange={(v) => flip(minutes, v)}
                  disabled={on && onlyOne}
                  testID={`lengths-${minutes}`}
                />
              }
              last={i === choices.length - 1}
            />
          );
        })}
      </Group>
      <Text variant="footnote" tone="secondary">
        {onlyOne ? 'Keep at least one length.' : 'Clients pick one of these when they book.'}
      </Text>
      <Button title="Done" variant="secondary" onPress={onClose} testID="lengths-done" />
    </Sheet>
  );
}
