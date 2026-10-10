import { Sheet } from '@/components/sheet';
import { Group, IconTile, ListRow, Text } from '@/components/ui';
import { Colors } from '@/constants/theme';

// A session of a repeat: change or remove only this one, or this and the later ones.
export function ScopeSheet({
  visible,
  title,
  laterSubtitle,
  note,
  danger,
  onOnly,
  onLater,
  onClose,
}: {
  visible: boolean;
  title: string;
  // "{n} booked sessions from {day}", and any clashes.
  laterSubtitle: string | null;
  note?: string;
  // Removing: the rows read in red.
  danger?: boolean;
  onOnly: () => void;
  onLater: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <Group style={{ backgroundColor: Colors.tint }}>
        <ListRow
          title="Only this one"
          leading={<IconTile icon="calendar-clear-outline" color={danger ? Colors.danger : undefined} />}
          titleTone={danger ? 'danger' : undefined}
          onPress={onOnly}
          testID="scope-this"
        />
        <ListRow
          title="This and later ones"
          subtitle={laterSubtitle ?? ' '}
          subtitleLines={2}
          leading={<IconTile icon="repeat-outline" color={danger ? Colors.danger : undefined} />}
          titleTone={danger ? 'danger' : undefined}
          onPress={onLater}
          testID="scope-later"
          last
        />
      </Group>
      {note ? (
        <Text variant="footnote" tone="secondary">
          {note}
        </Text>
      ) : null}
    </Sheet>
  );
}
