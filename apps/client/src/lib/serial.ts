// A load that takes longer than this (a request hanging on a bad connection) stops holding
// up the next one.
const STUCK_MS = 8_000;

// Whether a load is still the newest. A load checks it before showing what it got.
export type Current = () => boolean;

// Runs a screen's load one at a time. A call while one is running runs it once more
// afterwards (calls in the meantime share that run), so answers land in the order they
// were asked for: a slow older answer can't bring back an invite a newer one removed, and
// a newer load that fails keeps what the one before it showed. A load stuck for STUCK_MS
// stops holding up the next one, and once that one has started the stuck one's answer is
// no longer current, so it is dropped.
//
// The returned function takes `now`: the person asked for it (pull to refresh, Try again,
// an invite answered), so a fresh load starts straight away instead of waiting for a stuck
// one.
export function serial(load: (current: Current) => Promise<unknown>): (now?: boolean) => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  let newest = 0;
  let stopWaiting: (() => void) | null = null;
  return (now = false) => {
    if (running) {
      again = true;
      if (now) stopWaiting?.();
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          const mine = ++newest;
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            load(() => mine === newest).catch(() => {}),
            new Promise<void>((resolve) => {
              stopWaiting = resolve;
              timer = setTimeout(resolve, STUCK_MS);
            }),
          ]);
          clearTimeout(timer);
          stopWaiting = null;
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  };
}
