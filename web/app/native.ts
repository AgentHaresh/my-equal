// The native Android app (mobile/): the same pages, plus a few things a web page cannot do. The app
// injects window.Capacitor; in a normal browser none of this exists and every call here says so.
// The native side is mobile/android/app/src/main/java/com/agentsbakery/myequal/EqualPlugin.java.
import type { PhoneCall } from "@/lib/phonecalls";

type EqualPlugin = {
  googleSignIn: (o: { clientId: string }) => Promise<{ credential: string }>;
  callLog: (o: { since: number }) => Promise<{ calls: PhoneCall[] }>;
  callLogAllowed: () => Promise<{ allowed: boolean }>;
};
type Cap = { isNativePlatform?: () => boolean; Plugins?: { Equal?: EqualPlugin } };

const cap = () => (typeof window === "undefined" ? undefined : (window as unknown as { Capacitor?: Cap }).Capacitor);

/** Running inside the My Equal Android app. */
export const inApp = () => Boolean(cap()?.isNativePlatform?.() && cap()?.Plugins?.Equal);
const plugin = () => {
  const p = cap()?.Plugins?.Equal;
  if (!p) throw new Error("This needs the My Equal app.");
  return p;
};

/** Google sign-in with the phone's own account picker. Returns the same ID token the web button gives. */
export const nativeGoogleSignIn = async (clientId: string) => (await plugin().googleSignIn({ clientId })).credential;

/** Calls since a time, from the phone's call log. Asks for permission the first time. */
export const readCallLog = async (since: number) => (await plugin().callLog({ since })).calls;
export const callLogAllowed = async () => (inApp() ? (await plugin().callLogAllowed()).allowed : false);

// ---------- reminders the phone shows by itself (lib/local-alerts.ts), through @capacitor/local-notifications

type Perm = { display: "granted" | "denied" | "prompt" | "prompt-with-rationale" };
type LocalNotifications = {
  checkPermissions: () => Promise<Perm>;
  requestPermissions: () => Promise<Perm>;
  getPending: () => Promise<{ notifications: { id: number }[] }>;
  cancel: (o: { notifications: { id: number }[] }) => Promise<void>;
  schedule: (o: { notifications: { id: number; title: string; body: string; isExactNotification: boolean; schedule: { at: Date; allowWhileIdle: boolean } }[] }) => Promise<unknown>;
};
const notifications = () => (cap()?.Plugins as { LocalNotifications?: LocalNotifications } | undefined)?.LocalNotifications;

/** Whether the phone may show My Equal's reminders. Asks only when ask is true. */
export async function phoneRemindersAllowed(ask = false): Promise<boolean> {
  const n = notifications();
  if (!n) return false;
  const p = ask ? await n.requestPermissions() : await n.checkPermissions();
  return p.display === "granted";
}

/** Replace every reminder the phone has waiting with this plan. */
export async function setPhoneReminders(plan: { id: number; at: number; title: string; body: string }[]): Promise<void> {
  const n = notifications();
  if (!n) return;
  const pending = (await n.getPending()).notifications;
  if (pending.length) await n.cancel({ notifications: pending.map((p) => ({ id: p.id })) });
  // Not exact: Android may show them a few minutes late, which is fine for these. Exact alarms would need a
  // permission Android 14 and later deny by default, and the plugin would open a settings page to ask for it.
  if (plan.length) await n.schedule({ notifications: plan.map((a) => ({ id: a.id, title: a.title, body: a.body, isExactNotification: false, schedule: { at: new Date(a.at), allowWhileIdle: true } })) });
}

// ---------- messages while the app is closed: Firebase Cloud Messaging (@capacitor/push-notifications, lib/fcm.ts)

type PushPlugin = {
  checkPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, fn: (x: { value?: string; error?: string }) => void) => Promise<{ remove: () => void }>;
};
const pushPlugin = () => (cap()?.Plugins as { PushNotifications?: PushPlugin } | undefined)?.PushNotifications;
let pushToken: Promise<string | null> | null = null;

/**
 * Register this phone for messages from the server and give the server its token. Only once
 * notifications are allowed (the reminders ask for that). Resolves to the token, or null.
 */
export function registerPhonePush(): Promise<string | null> {
  const p = pushPlugin();
  if (!p) return Promise.resolve(null);
  pushToken ??= (async () => {
    if ((await p.checkPermissions()).receive !== "granted") return null;
    const token = await new Promise<string | null>((resolve) => {
      void p.addListener("registration", (x) => resolve(x.value ?? null));
      void p.addListener("registrationError", () => resolve(null));
      void p.register().catch(() => resolve(null));
      setTimeout(() => resolve(null), 20000);
    });
    if (token) await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fcm: token }) });
    return token;
  })();
  void pushToken.then((t) => {
    if (!t) pushToken = null; // try again next time
  });
  return pushToken;
}
