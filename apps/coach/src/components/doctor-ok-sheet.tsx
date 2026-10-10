import { useState } from 'react';

import { PaidOn } from '@/components/paid-on';
import { Sheet } from '@/components/sheet';
import { useToast } from '@/components/toast';
import { Button, ErrorText, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { saveDoctorOk } from '@/lib/client-health';
import { plainError } from '@/lib/errors';
import { haptic } from '@/lib/haptics';
import { HOME_ZONE, zonedParts } from '@/lib/zones';

// The day the client's doctor said training is fine, noted by the trainer.
export function DoctorOkSheet({
  visible,
  clientId,
  first,
  from,
  value,
  onClose,
  onSaved,
}: {
  visible: boolean;
  clientId: string;
  first: string;
  // The earliest day to pick: the day the form was signed (or long ago without a form).
  from: string;
  value: string | null;
  onClose: () => void;
  onSaved: (day: string | null) => void;
}) {
  const toast = useToast();
  const { profile } = useAuth();
  const today = zonedParts(new Date(), profile?.time_zone || HOME_ZONE).day;
  const [day, setDay] = useState(value ?? today);
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDay(value ?? today);
      setError(null);
    }
  }

  async function save(next: string | null) {
    if (busy) return;
    setBusy(next ? 'save' : 'clear');
    setError(null);
    try {
      await saveDoctorOk(clientId, next);
    } catch (e) {
      setBusy(null);
      haptic.warning();
      return setError(plainError(e, 'Couldn’t save. Try again.'));
    }
    setBusy(null);
    if (next) haptic.success();
    else haptic.select();
    toast(next ? 'Saved' : 'Doctor’s OK cleared');
    onSaved(next);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Doctor’s OK">
      <Text variant="footnote" tone="secondary">
        {`The day ${first}’s doctor said training is fine.`}
      </Text>
      <PaidOn
        day={day}
        today={today}
        from={from > today ? today : from}
        onChange={setDay}
        title="Doctor’s OK"
        testIDPrefix="doctor-ok-day-"
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={() => save(day)} loading={busy === 'save'} testID="doctor-ok-save" />
      {value ? (
        <Button
          title="Clear"
          variant="ghost"
          onPress={() => save(null)}
          loading={busy === 'clear'}
          testID="doctor-ok-clear"
        />
      ) : null}
    </Sheet>
  );
}
