import * as Clipboard from 'expo-clipboard';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { InviteCard } from '@/components/invite-card';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Text, TextField, TextLink } from '@/components/ui';
import { Colors, Spacing, Tabular, themed } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { findCode, formatCode, isCode, normalizeCode } from '@/lib/invite-code';
import { callRpc } from '@/lib/rpc';
import { trainerTitle, type Invite } from '@/lib/trainers';

// The web can only read the clipboard where the browser offers it.
const CAN_PASTE =
  Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function');

const NO_MATCH = 'That code didn’t work. Check it in your trainer’s message. Codes work once and last 30 days.';
const OLD_DATABASE = 'Invite codes don’t work yet. Ask your trainer to add you with your email.';
const EMPTY_CLIPBOARD = 'There’s no code on your clipboard. Copy it from the message first.';
const ALREADY = 'You’re already connected to this trainer.';

// invite_by_code answers one value: the invite, { already_connected: true }, or null when the code
// opens nothing.
type CodeAnswer = Invite | { already_connected: true } | null;

// For people a trainer reached on WhatsApp: they type (or paste) the 8-character code from the
// message, then see the trainer's invite with everything the trainer will see, and accept it or
// leave it for now. onJoined runs once they are connected, so the screen behind loads again.
export function InviteCodeSheet({
  visible,
  onClose,
  onJoined,
}: {
  visible: boolean;
  onClose: () => void;
  onJoined: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  // Each opening starts with an empty code.
  const [shownFor, setShownFor] = useState(visible);
  if (visible !== shownFor) {
    setShownFor(visible);
    if (visible) {
      setText('');
      setError(null);
      setBusy(false);
      setInvite(null);
    }
  }
  // An answer that comes after the sheet closed, or after a newer try, is dropped.
  const asked = useRef(0);
  const ready = isCode(text);

  function close() {
    asked.current += 1;
    onClose();
  }

  function fail(sentence: string) {
    setError(sentence);
    haptic.warning();
  }

  function edit(next: string) {
    // A whole message pasted into the field keeps just its code.
    const found = next.length > 9 ? findCode(next) : null;
    setText(formatCode(found ?? next));
    setError(null);
  }

  async function paste() {
    const copied = await Clipboard.getStringAsync().catch(() => '');
    const found = findCode(copied ?? '');
    if (found) edit(found);
    else setError(EMPTY_CLIPBOARD);
  }

  async function next() {
    if (!ready || busy) return;
    const mine = ++asked.current;
    setBusy(true);
    setError(null);
    try {
      const answer = await callRpc<CodeAnswer>('invite_by_code', { p_code: normalizeCode(text) });
      if (mine !== asked.current) return;
      const found = answer.data;
      if (answer.missing) fail(OLD_DATABASE);
      else if (!found) fail(NO_MATCH);
      else if ('already_connected' in found) fail(ALREADY);
      else setInvite(found);
    } catch (e) {
      // The database's own sentences: "Confirm your email first…", "Too many tries…".
      if (mine === asked.current) fail(plainError(e));
    }
    if (mine === asked.current) setBusy(false);
  }

  function answered(joined: boolean) {
    const first = invite ? invite.trainer_name?.split(' ')[0] || trainerTitle(invite) : null;
    close();
    if (joined && first) toast(`You’re connected with ${first}`);
    onJoined();
  }

  return (
    <Sheet visible={visible} onClose={close} title={invite ? 'Your trainer’s invite' : 'Enter your invite code'}>
      {invite ? (
        <InviteCard invite={invite} code={normalizeCode(text)} onAnswered={answered} onNotNow={close} />
      ) : (
        <>
          <Text variant="callout" tone="secondary">
            It’s in the WhatsApp message from your trainer: 8 letters and numbers.
          </Text>
          <View style={{ gap: Spacing.two }}>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Invite code"
                  value={text}
                  onChangeText={edit}
                  placeholder="XXXX-XXXX"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  autoComplete="off"
                  importantForAutofill="no"
                  keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
                  returnKeyType="go"
                  onSubmitEditing={next}
                  testID="code-input"
                  style={[Tabular, styles.code, error ? { borderColor: Colors.danger } : null]}
                />
              </View>
              {CAN_PASTE ? (
                <View style={styles.paste} testID="code-paste">
                  <TextLink label="Paste" onPress={paste} />
                </View>
              ) : null}
            </View>
            <ErrorText testID="code-error">{error}</ErrorText>
          </View>
          <Button
            title="Continue"
            onPress={next}
            loading={busy}
            disabled={!ready}
            testID="code-continue"
            style={{ marginTop: Spacing.one }}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = themed(() => ({
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  // The link sits beside the box, centred on it.
  paste: {
    minHeight: 52,
    justifyContent: 'center',
  },
  code: {
    letterSpacing: 1,
  },
}));
