// A load that takes longer than this (a request hanging on a bad connection) stops holding
// up the next one.
const STUCK_MS = 20_000;

// Runs a screen's load one at a time. A call while one is running runs it once more
// afterwards (calls in the meantime share that run). Answers then land in the order they
// were asked for, so a slow older answer can't bring back an invite a newer one removed,
// and a newer load that fails keeps what the one before it showed.
export function serial(load: () => Promise<unknown>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          let timer: ReturnType<typeof setTimeout> | undefined;
          await Promise.race([
            load().catch(() => {}),
            new Promise((resolve) => {
              timer = setTimeout(resolve, STUCK_MS);
            }),
          ]);
          clearTimeout(timer);
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  };
}
