import fs from "fs";
import path from "path";
import * as webpush from "web-push";
import { root, save } from "./store";
import { count } from "./metrics";
import { notifyFcm } from "./fcm";

/**
 * Notifications that reach a phone or computer while My Equal is closed: a new message, an
 * incoming call, a reminder that is due. They use the browser's own push service. What is sent is
 * encrypted for that one browser, so the push service carries it without being able to read it.
 *
 * The server's signing keys are made once and kept beside the chat data, never in the code.
 */

export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Note = { title: string; body: string; tag?: string; url?: string };

const KEYS_FILE = path.join(process.cwd(), "data", "vapid.json");
let ready: { publicKey: string } | null = null;

function keys() {
  if (ready) return ready;
  let k: { publicKey: string; privateKey: string };
  try {
    k = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  } catch {
    k = webpush.generateVAPIDKeys();
    fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify(k), { mode: 0o600 });
  }
  webpush.setVapidDetails(process.env.PUBLIC_URL ?? "https://54-213-236-215.sslip.io", k.publicKey, k.privateKey);
  ready = { publicKey: k.publicKey };
  return ready;
}

export const pushPublicKey = () => keys().publicKey;

type Store = { push?: Record<string, PushSub[]> };
const subs = () => ((root() as unknown as Store).push ??= {});

const valid = (s: unknown): s is PushSub => {
  const x = s as PushSub;
  return typeof x?.endpoint === "string" && /^https:\/\//.test(x.endpoint) && x.endpoint.length < 1000 && typeof x.keys?.p256dh === "string" && typeof x.keys?.auth === "string";
};

/** Remember a browser that agreed to notifications. At most five per person; the oldest goes. */
export function subscribe(userId: string, sub: unknown): boolean {
  if (!valid(sub)) return false;
  const list = (subs()[userId] ??= []).filter((s) => s.endpoint !== sub.endpoint);
  list.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  subs()[userId] = list.slice(-5);
  save();
  return true;
}

export function unsubscribe(userId: string, endpoint: string) {
  const before = subs()[userId]?.length ?? 0;
  subs()[userId] = (subs()[userId] ?? []).filter((s) => s.endpoint !== endpoint);
  if (subs()[userId].length !== before) save();
}

export const subscribed = (userId: string) => (subs()[userId]?.length ?? 0) > 0;

/** Send a notification to every browser and Android phone this person has turned notifications on in. Never throws. */
export function notify(userId: string, note: Note) {
  void notifyFcm(userId, note).catch(() => {}); // the Android app (lib/fcm.ts)
  const list = subs()[userId];
  if (!list?.length) return;
  keys();
  for (const sub of list) {
    count("push.sent");
    try {
      webpush.sendNotification(sub, JSON.stringify(note), { TTL: 3600, urgency: "high" }).catch((e: { statusCode?: number }) => {
        // The browser has withdrawn this subscription: forget it.
        if (e?.statusCode === 404 || e?.statusCode === 410) unsubscribe(userId, sub.endpoint);
      });
    } catch {
      unsubscribe(userId, sub.endpoint); // a subscription the library cannot even use
    }
  }
}
