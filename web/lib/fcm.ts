import { root, save } from "./store";
import { count } from "./metrics";
import { log } from "./log";
import type { Note } from "./push";

/**
 * Notifications to the Android app while it is closed, through Firebase Cloud Messaging (FCM).
 * The browser version uses Web Push (lib/push.ts); notify() there sends to both.
 *
 * No key file: on the Google Cloud server the app signs in as the machine's own service account
 * (the metadata server gives a short-lived token), which is allowed only to send messages. Anywhere
 * else (a laptop, tests) there is no such account and nothing is sent.
 */

type Store = { fcm?: Record<string, string[]> };
const tokens = () => ((root() as unknown as Store).fcm ??= {});
const META = "http://metadata.google.internal/computeMetadata/v1";

/** Remember this phone's FCM token. At most five phones per person; the oldest goes. */
export function addFcmToken(userId: string, token: unknown): boolean {
  if (typeof token !== "string" || !/^[\w:.-]{20,4096}$/.test(token)) return false;
  const list = (tokens()[userId] ?? []).filter((t) => t !== token);
  list.push(token);
  tokens()[userId] = list.slice(-5);
  save();
  return true;
}

export function removeFcmToken(userId: string, token: string) {
  const before = tokens()[userId]?.length ?? 0;
  tokens()[userId] = (tokens()[userId] ?? []).filter((t) => t !== token);
  if (tokens()[userId].length !== before) save();
}

export const hasFcm = (userId: string) => (tokens()[userId]?.length ?? 0) > 0;

let cached: { token: string; until: number; project: string } | null = null;
let unavailable = false;

async function access(): Promise<{ token: string; project: string } | null> {
  if (unavailable) return null;
  if (cached && cached.until > Date.now() + 60000) return cached;
  try {
    const headers = { "Metadata-Flavor": "Google" };
    const [tok, project] = await Promise.all([
      fetch(`${META}/instance/service-accounts/default/token`, { headers, signal: AbortSignal.timeout(2000) }).then((r) => r.json() as Promise<{ access_token: string; expires_in: number }>),
      process.env.FCM_PROJECT ? Promise.resolve(process.env.FCM_PROJECT) : fetch(`${META}/project/project-id`, { headers, signal: AbortSignal.timeout(2000) }).then((r) => r.text()),
    ]);
    cached = { token: tok.access_token, until: Date.now() + tok.expires_in * 1000, project };
    return cached;
  } catch {
    unavailable = true; // not on Google Cloud: no FCM here
    return null;
  }
}

/** Send to every phone this person has the app on. Never throws. */
export async function notifyFcm(userId: string, note: Note): Promise<void> {
  const list = tokens()[userId];
  if (!list?.length) return;
  const auth = await access();
  if (!auth) return;
  for (const token of list) {
    count("push.fcm");
    try {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: note.title, body: note.body },
            data: { url: note.url ?? "/" },
            android: { priority: "HIGH", ttl: "3600s", notification: { tag: note.tag, icon: "ic_stat_equal", color: "#CEF82C" } },
          },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404 || res.status === 400) {
        const body = await res.text();
        if (/UNREGISTERED|INVALID_ARGUMENT/.test(body)) removeFcmToken(userId, token); // the app was removed or the token is stale
      } else if (!res.ok) {
        log.warn("fcm.failed", { status: res.status });
      }
    } catch (e) {
      log.warn("fcm.failed", { error: e instanceof Error ? e.message.slice(0, 80) : "error" });
    }
  }
}
