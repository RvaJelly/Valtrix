// A load that takes longer than this (a request hanging on a bad connection) stops holding
// up the next one.
const STUCK_MS = 8_000;

// Whether a load may show what it got: false once a newer load has shown its answer. A load
// calls it once, right before showing, which marks it as shown. current(false) only asks.
export type Current = (show?: boolean) => boolean;

// Runs a screen's load one at a time. A call while one is running runs it once more
// afterwards (calls in the meantime share that run), so answers land in the order they
// were asked for: a slow older answer can't bring back an invite a newer one removed. A
// load stuck for STUCK_MS stops holding up the next one; if its answer comes after a newer
// one was shown, it is dropped.
//
// The returned function takes `now`: the person asked for it (pull to refresh, Try again,
// an invite answered), so a fresh load starts straight away instead of waiting for a stuck
// one.
export function serial(load: (current: Current) => Promise<unknown>): (now?: boolean) => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  let newest = 0;
  // The newest load that has shown its answer.
  let shown = 0;
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
          const current: Current = (show = true) => {
            if (mine < shown) return false;
            if (show) shown = mine;
            return true;
          };
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            // Through a promise, so a load that throws straight away can't wedge the queue.
            Promise.resolve()
              .then(() => load(current))
              .catch(() => {}),
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

// Gives up on a request after `ms`. Supabase requests have no time limit of their own, and on a
// weak gym connection one can hang for minutes; this makes it fail like a dropped connection,
// so the screen falls back (to the copy on the phone, or "Check your connection").
export function within<T>(request: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(request),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
