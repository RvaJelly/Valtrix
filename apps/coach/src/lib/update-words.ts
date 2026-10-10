// One update's line for Home and Updates: what a client did in Voltrix, in a few words. `when` is
// "{shortDate}, {time24}" from the caller. Pure: no runtime imports, so the unit checks can load it.

export function updateLine(kind: string, payload: Record<string, unknown>, first: string, when: string): string {
  switch (kind) {
    case 'booked':
      return `${first} booked ${when}`;
    case 'cancelled':
      // Whether it was paid shows as a pill under the line (update-row.tsx).
      return `${first} cancelled ${when}`;
    case 'requested':
      return `${first} asked for ${when}`;
    case 'training_request':
      return `${first} asked to train with you`;
    case 'health': {
      const change = payload.change;
      if (change === 'delete') return `${first} removed their health form`;
      if (change === 'update') return `${first} changed their health form`;
      return `${first} filled in their health form`;
    }
    default:
      return `${first} has news for you`;
  }
}

// The icon at the start of an update's row.
export function updateIcon(kind: string) {
  switch (kind) {
    case 'booked':
      return 'calendar-outline' as const;
    case 'cancelled':
      return 'close-circle-outline' as const;
    case 'requested':
      return 'time-outline' as const;
    case 'training_request':
      return 'person-add-outline' as const;
    case 'health':
      return 'medkit-outline' as const;
    default:
      return 'notifications-outline' as const;
  }
}
