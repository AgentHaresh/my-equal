/**
 * A nudge from the server to every open app: "something changed, come and look". Each open app
 * holds one connection; when anything is saved, they are all told at once and ask for their own
 * news. This is what makes a message appear straight away instead of at the next check.
 *
 * It tells no one what changed or for whom. Each app then asks for its own state as usual.
 */
type Listener = () => void;
const holder = globalThis as unknown as { __equalLive?: Set<Listener> };
const listeners = () => (holder.__equalLive ??= new Set<Listener>());

export function listen(fn: Listener): () => void {
  listeners().add(fn);
  return () => listeners().delete(fn);
}

export function poke() {
  for (const fn of listeners()) {
    try {
      fn();
    } catch {
      /* a closed connection is cleaned up by its own handler */
    }
  }
}

/** How many apps are connected right now. */
export const liveCount = () => listeners().size;
