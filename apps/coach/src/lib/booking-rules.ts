import { callRpc } from '@/lib/rpc';
import { supabase } from '@/lib/supabase';

// Online booking: the trainer's rules for clients booking their open times in Voltrix. One row per
// trainer; none yet means the defaults below, with booking off.

export type HoursRange = { day: 1 | 2 | 3 | 4 | 5 | 6 | 7; from: string; to: string };

export type BookingRules = {
  enabled: boolean;
  mode: 'approve' | 'auto';
  hours: HoursRange[];
  lengths: number[];
  notice_minutes: number;
  horizon_days: number;
  // Null: clients can't cancel in the app.
  cancel_minutes: number | null;
  step_minutes: 15 | 30 | 60;
  buffer_minutes: number;
  max_ahead: number;
  location: string | null;
};

export const DEFAULT_RULES: BookingRules = {
  enabled: false,
  mode: 'approve',
  hours: [],
  lengths: [60],
  notice_minutes: 720,
  horizon_days: 28,
  cancel_minutes: 1440,
  step_minutes: 30,
  buffer_minutes: 0,
  max_ahead: 4,
  location: null,
};

export const LENGTH_CHOICES = [30, 45, 60, 90, 120];

const RULE_COLUMNS =
  'enabled, mode, hours, lengths, notice_minutes, horizon_days, cancel_minutes, step_minutes, buffer_minutes, max_ahead, location';

function asRules(row: Partial<BookingRules> | null): BookingRules {
  if (!row) return { ...DEFAULT_RULES };
  return {
    enabled: !!row.enabled,
    mode: row.mode === 'auto' ? 'auto' : 'approve',
    hours: Array.isArray(row.hours) ? row.hours : [],
    lengths: Array.isArray(row.lengths) && row.lengths.length ? row.lengths.map(Number) : [60],
    notice_minutes: Number(row.notice_minutes ?? DEFAULT_RULES.notice_minutes),
    horizon_days: Number(row.horizon_days ?? DEFAULT_RULES.horizon_days),
    cancel_minutes: row.cancel_minutes == null ? null : Number(row.cancel_minutes),
    step_minutes: ([15, 30, 60].includes(Number(row.step_minutes)) ? Number(row.step_minutes) : 30) as 15 | 30 | 60,
    buffer_minutes: Number(row.buffer_minutes ?? 0),
    max_ahead: Number(row.max_ahead ?? DEFAULT_RULES.max_ahead),
    location: row.location ?? null,
  };
}

// The trainer's rules, or the defaults (booking off) when there are none yet. Errors are thrown.
export async function loadRules(): Promise<BookingRules> {
  const { data, error } = await supabase.from('booking_rules').select(RULE_COLUMNS).maybeSingle();
  if (error) throw error;
  return asRules(data as Partial<BookingRules> | null);
}

// Saves every rule. trainer_id isn't sent: the database fills it with the signed-in trainer.
export async function saveRules(rules: BookingRules): Promise<void> {
  const { error } = await supabase.from('booking_rules').upsert(
    {
      enabled: rules.enabled,
      mode: rules.mode,
      hours: rules.hours,
      lengths: rules.lengths,
      notice_minutes: rules.notice_minutes,
      horizon_days: rules.horizon_days,
      cancel_minutes: rules.cancel_minutes,
      step_minutes: rules.step_minutes,
      buffer_minutes: rules.buffer_minutes,
      max_ahead: rules.max_ahead,
      location: rules.location,
    },
    { onConflict: 'trainer_id' },
  );
  if (error) throw error;
}

// The open times clients would see from `from` ('YYYY-MM-DD') for `days` days, booking on or off,
// on the trainer's clock. Errors are thrown; an older database answers an empty list.
export async function previewTimes(
  from: string,
  days: number,
  minutes?: number,
): Promise<{ starts_at: string; local_day: string; local_time: string }[]> {
  const answer = await callRpc<{ starts_at: string; local_day: string; local_time: string }[]>('booking_preview', {
    p_from: from,
    p_days: days,
    p_minutes: minutes ?? null,
  });
  return answer.missing ? [] : (answer.data ?? []);
}

// Whether clients can book in Voltrix now: 'Off', 'Ask me first' or 'Instant'.
export function modeLabel(rules: Pick<BookingRules, 'enabled' | 'mode'> | null): string {
  if (!rules || !rules.enabled) return 'Off';
  return rules.mode === 'auto' ? 'Instant' : 'Ask me first';
}
