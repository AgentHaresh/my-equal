import type { CapacitorConfig } from "@capacitor/cli";

// The app opens the My Equal server's own pages (messenger, Equal, private chats, the on-device lock),
// and adds native pieces the web cannot reach (android/app/src/main/java/.../EqualPlugin.kt).
// EQUAL_URL picks the server when syncing. For an emulator or a phone on this laptop: `adb reverse tcp:3000 tcp:3000`
// and http://localhost:3000 (localhost counts as secure, so sign-in cookies work).
const url = process.env.EQUAL_URL ?? "https://34-93-202-193.sslip.io";

const config: CapacitorConfig = {
  // Fixed once the app is on Google Play: change it before the first upload if needed.
  appId: "com.agentsbakery.myequal",
  appName: "My Equal",
  webDir: "www", // shown only if the server cannot be reached
  server: {
    url,
    cleartext: url.startsWith("http://"), // only for a local test server
    errorPath: "offline.html",
  },
  plugins: {
    // Reminders the phone shows by itself (web/lib/local-alerts.ts): My Equal's four dots, in its lime.
    LocalNotifications: { smallIcon: "ic_stat_equal", iconColor: "#CEF82C" },
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.EQUAL_DEBUG === "1",
  },
};

export default config;
