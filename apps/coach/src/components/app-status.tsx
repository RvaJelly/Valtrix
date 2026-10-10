import { StatusDot, type StatusTone } from '@/components/ui';
import { APP_STATUS_LABELS, type AppStatus } from '@/lib/clients';

const TONES: Record<AppStatus, StatusTone> = {
  joined: 'success',
  invited: 'neutral',
  not_on_app: 'muted',
  declined: 'danger',
  left: 'danger',
  gone: 'danger',
};

// The short words for lists, where the client page's longer ones don't fit.
const SHORT: Record<AppStatus, string> = {
  joined: 'Joined',
  invited: 'Invited',
  not_on_app: 'Not on Voltrix',
  declined: 'Declined',
  left: 'Left',
  gone: 'Left',
};

// Where a client is with the Voltrix app, in plain words: "Invite waiting", "Joined"... as a dot and
// a word. `short` is for list rows. `size` is kept for older callers; the look is the same.
export function AppStatusLabel({ status, short }: { status: AppStatus; short?: boolean; size?: number }) {
  return <StatusDot tone={TONES[status]} label={short ? SHORT[status] : APP_STATUS_LABELS[status]} />;
}
