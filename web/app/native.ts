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
