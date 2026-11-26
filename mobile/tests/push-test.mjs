// Firebase push to the Android app, end to end: the app registers with Firebase, the live server's
// own Google identity sends a message to that phone, and Android shows it with the app closed.
// Usage (from mobile/), with an emulator that has Google Play services running:
//   EQUAL_DEBUG=1 npx cap sync android && (cd android && gradlew assembleDebug)
//   SSH_KEY=~/.ssh/my-equal-gcp node tests/push-test.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";
import { _android as android } from "playwright-core";

const sdk = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");
const adb = (...args) => execFileSync(path.join(sdk, "platform-tools", "adb"), args, { encoding: "utf8" }).trim();
const APP = "com.agentsbakery.myequal";
const SERVER = process.env.SERVER ?? "ubuntu@34.93.202.193";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

adb("install", "-r", path.join("android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"));
adb("shell", "pm", "grant", APP, "android.permission.POST_NOTIFICATIONS");
adb("shell", "am", "start", "-n", `${APP}/.MainActivity`);

const [device] = await android.devices();
const page = await (await device.webView({ pkg: APP }, { timeout: 120000 })).page();
page.setDefaultTimeout(60000);

// The app registers this phone with Firebase (what registerPhonePush does once notifications are allowed).
const token = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const p = window.Capacitor.Plugins.PushNotifications;
      p.addListener("registration", (x) => resolve(x.value));
      p.addListener("registrationError", (e) => resolve("ERROR " + JSON.stringify(e)));
      p.register();
      setTimeout(() => resolve(null), 60000);
    }),
);
check("the phone registers with Firebase and gets a token", typeof token === "string" && !token.startsWith("ERROR") && token.length > 50, token ? `${token.slice(0, 12)}…` : "none");

// The app goes to the background and its process is killed, as when the phone reclaims it.
adb("shell", "input", "keyevent", "KEYCODE_HOME");
await wait(2000);
adb("shell", "am", "kill", APP);

// The live server sends, signed in as its own Google Cloud identity (as lib/fcm.ts does).
const TITLE = `Priya wrote to you (push test ${Date.now() % 100000})`;
const send = `T=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])'); curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $T" -H "Content-Type: application/json" https://fcm.googleapis.com/v1/projects/my-equal-ab/messages:send -d '{"message":{"token":"${token}","notification":{"title":"${TITLE}","body":"Open My Equal to read it."},"android":{"priority":"HIGH","notification":{"icon":"ic_stat_equal","color":"#CEF82C"}}}}'`;
const key = (process.env.SSH_KEY ?? path.join(process.env.USERPROFILE ?? "", ".ssh", "my-equal-gcp")).replace(/^~/, process.env.USERPROFILE ?? "");
const status = execFileSync("ssh", ["-i", key, "-o", "ConnectTimeout=20", SERVER, send], { encoding: "utf8" }).trim();
check("the live server's own identity sends the message", status === "200", `HTTP ${status}`);

let shown = false;
for (let i = 0; i < 30 && !shown; i++) {
  await wait(2000);
  shown = adb("shell", "dumpsys", "notification", "--noredact").includes(TITLE);
}
check("Android shows it with the app closed", shown);

try {
  await device.close();
} catch {
  /* the web view went away with the app */
}
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);
process.exit(results.every(Boolean) ? 0 : 1);
