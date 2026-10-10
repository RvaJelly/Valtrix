import { useState } from 'react';
import { View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Text, TextField } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { askTrainer, isPhoneNumber } from '@/lib/trainers';

const NOTE_MAX = 300;
const PHONE_MAX = 30;

// Asking a trainer to train you: what the trainer will see if they say yes (round 1's words), what
// they see now, an optional note and WhatsApp number, and Send request. Pressing Send under those
// words is the person's agreement, which the database records with the request.
export function AskSheet({
  visible,
  trainerId,
  first,
  onClose,
  onSent,
}: {
  visible: boolean;
  trainerId: string;
  first: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const number = phone.trim();
    if (number && !isPhoneNumber(number)) {
      haptic.warning();
      setPhoneError('Check the number and try again.');
      return;
    }
    setBusy(true);
    setError(null);
    setPhoneError(null);
    try {
      await askTrainer(trainerId, note.trim() || null, number || null);
      haptic.success();
      toast(`Request sent to ${first}.`);
      setNote('');
      setPhone('');
      onClose();
      onSent();
    } catch (e) {
      haptic.warning();
      setError(plainError(e, 'Couldn’t send your request. Check your connection and try again.'));
      // The answer may have changed what this profile can offer (a limit, a no): show what is true now.
      onSent();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        setError(null);
        setPhoneError(null);
      }}
      title={`Ask ${first} to train you`}>
      <View testID="ask-sheet" style={{ gap: Spacing.gutter }}>
        <View style={{ gap: Spacing.tight }}>
          <Text variant="callout" tone="secondary">
            If {first} accepts, {first} can see your food diary, workouts, progress (weight, measurements and photos),
            check-ins and habits, including what you logged before, your health form if you filled it in, your sessions
            with them and your chats. You can message and call each other. You can leave any time in Settings.
          </Text>
          <Text variant="footnote" tone="secondary">
            {first} sees your name, photo and this note, and your number if you add it. Your email is shared only if{' '}
            {first} accepts.
          </Text>
        </View>
        <TextField
          label={`Note for ${first}`}
          optional
          value={note}
          onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
          placeholder="Your goal, and the days that suit you"
          multiline
          maxLength={NOTE_MAX}
          testID="ask-note"
          style={{ minHeight: 88, paddingTop: Spacing.three, textAlignVertical: 'top' }}
        />
        <TextField
          label="WhatsApp number"
          optional
          value={phone}
          onChangeText={(t) => {
            setPhone(t.slice(0, PHONE_MAX));
            setPhoneError(null);
          }}
          placeholder="082 555 0303"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={PHONE_MAX}
          error={phoneError}
          testID="ask-phone"
        />
        <View style={{ gap: Spacing.tight }}>
          <ErrorText testID="ask-error">{error}</ErrorText>
          <Button title="Send request" onPress={send} loading={busy} testID="ask-send" />
        </View>
      </View>
    </Sheet>
  );
}
