import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Group, StatusPill, Text } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { shortDate, time24, timeRange } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { refreshReminders } from '@/lib/reminders';
import { endOf, sessionName, type Session } from '@/lib/sessions';
import { supabase } from '@/lib/supabase';

type Mark = 'completed' | 'no_show';

// Sessions that have ended and are still Booked: Done or No-show for each, with Undo. Opened from
// Home, the calendar (one week) and a client's Overview (one client), with the list already loaded.
// `onChanged` lets the opener load again; it runs once the sheet closes after a change.
export function ToMarkSheet({
  visible,
  sessions,
  onClose,
  onChanged,
}: {
  visible: boolean;
  sessions: Session[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const large = useWindowDimensions().fontScale > 1.15;
  // What each row was marked as here, and a row whose save failed.
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [changed, setChanged] = useState(false);
  // The rows stay as they were when the sheet opened, so a marked one shows its pill instead of
  // jumping away.
  const [rows, setRows] = useState<Session[]>(sessions);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setRows(sessions);
      setMarks({});
      setErrors({});
    }
  }

  function close() {
    onClose();
    if (changed) {
      setChanged(false);
      onChanged();
    }
  }

  async function save(id: string, status: Mark | 'scheduled') {
    const { error } = await supabase.from('sessions').update({ status }).eq('id', id);
    if (!error) refreshReminders();
    return error;
  }

  async function mark(session: Session, status: Mark) {
    const id = session.id;
    if (status === 'completed') haptic.success();
    else haptic.select();
    setErrors((e) => ({ ...e, [id]: null }));
    const next = { ...marks, [id]: status };
    setMarks(next);
    const error = await save(id, status);
    if (error) {
      haptic.warning();
      setMarks((m) => {
        const rest = { ...m };
        delete rest[id];
        return rest;
      });
      setErrors((e) => ({ ...e, [id]: plainError(error, 'Couldn’t save. Try again.') }));
      return;
    }
    setChanged(true);
    toast(status === 'completed' ? 'Marked as done' : 'Marked as a no-show', {
      action: {
        label: 'Undo',
        onPress: async () => {
          haptic.select();
          const failed = await save(id, 'scheduled');
          if (failed) return toast(plainError(failed, 'Couldn’t undo. Try again.'));
          setMarks((m) => {
            const rest = { ...m };
            delete rest[id];
            return rest;
          });
          onChanged();
        },
      },
    });
    // The last one: the sheet goes and the opener shows what is left.
    if (rows.every((s) => next[s.id])) {
      setTimeout(() => {
        onClose();
        setChanged(false);
        onChanged();
      }, 600);
    }
  }

  function open(session: Session) {
    close();
    router.push({ pathname: '/sessions/[id]', params: { id: session.id } });
  }

  const now = new Date();
  return (
    <Sheet visible={visible} onClose={close} title="Sessions to mark">
      <View testID="to-mark-sheet" style={{ gap: Spacing.three }}>
        <Text variant="callout" tone="secondary">
          Mark what happened. Done sessions count towards your earnings.
        </Text>
        <Group style={{ backgroundColor: Colors.tint }}>
          {rows.map((s, i) => {
            const start = new Date(s.starts_at);
            const name = sessionName(s);
            const when = `${shortDate(start, now)} · ${timeRange(start, endOf(s))}`;
            // The start is enough to tell sessions apart, and it leaves room for both buttons.
            const shown = `${shortDate(start, now)} · ${time24(start)}`;
            const marked = marks[s.id];
            const buttons = marked ? (
              <StatusPill
                tone={marked === 'completed' ? 'success' : 'warning'}
                label={marked === 'completed' ? 'Done' : 'No-show'}
              />
            ) : (
              <View style={styles.buttons}>
                <Button
                  title="Done"
                  variant="secondary"
                  size="small"
                  accessibilityLabel={`${name}, ${when}: done`}
                  testID={`mark-done-${s.id}`}
                  onPress={() => mark(s, 'completed')}
                />
                <Button
                  title="No-show"
                  variant="secondary"
                  size="small"
                  accessibilityLabel={`${name}, ${when}: no-show`}
                  testID={`mark-noshow-${s.id}`}
                  onPress={() => mark(s, 'no_show')}
                />
              </View>
            );
            return (
              <View key={s.id} style={[styles.row, i < rows.length - 1 && styles.line]}>
                <View style={[styles.rowInner, large && styles.rowStacked]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${name}, ${when}. Open the session`}
                    onPress={() => open(s)}
                    style={({ pressed }) => [styles.who, pressed && { opacity: 0.6 }]}>
                    <Text variant="rowTitle" numberOfLines={large ? 2 : 1}>
                      {name}
                    </Text>
                    <Text variant="footnote" tone="secondary" style={Tabular} numberOfLines={large ? 2 : 1}>
                      {large ? when : shown}
                    </Text>
                  </Pressable>
                  {buttons}
                </View>
                <ErrorText>{errors[s.id]}</ErrorText>
              </View>
            );
          })}
        </Group>
      </View>
    </Sheet>
  );
}

const styles = themed(() => ({
  row: {
    paddingHorizontal: Spacing.gutter,
    paddingVertical: Spacing.tight,
    gap: Spacing.two,
  },
  line: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.tight,
    minHeight: 44,
  },
  rowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  who: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    minHeight: 44,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
}));
