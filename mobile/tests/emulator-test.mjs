// The Android app on an emulator, end to end: the app opens the My Equal pages, the native bridge is
// there, and calls in the phone's call log reach the right people on the phone, never the server.
//
// Usage (from mobile/), with an emulator running and a test server on this laptop:
//   (web/) TEST_LOGIN_SECRET=localtest npx next start -p 3217
//   EQUAL_URL=http://localhost:3217 EQUAL_DEBUG=1 npx cap sync android && (cd android && gradlew assembleDebug)
//   node tests/emulator-test.mjs
import { execFileSync } from "node:child_process";
import path from "node:path";
import { _android as android } from "playwright-core";

const sdk = process.env.ANDROID_HOME ?? path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");
const adb = (...args) => execFileSync(path.join(sdk, "platform-tools", "adb"), args, { encoding: "utf8" }).trim();
const APP = "com.agentsbakery.myequal";
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

adb("install", "-r", path.join("android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"));
adb("shell", "pm", "clear", APP);
// The phone reaches the laptop's server as localhost (a secure origin, so the session cookie is kept).
adb("reverse", "tcp:3217", "tcp:3217");
adb("shell", "pm", "grant", APP, "android.permission.READ_CALL_LOG");
adb("shell", "pm", "grant", APP, "android.permission.POST_NOTIFICATIONS");

// The phone's call log: Ravi called for 5 minutes yesterday, Priya was missed, the dentist called.
const now = Date.now();
const call = (number, name, type, ago, secs) =>
  adb("shell", "content", "insert", "--uri", "content://call_log/calls", "--bind", `number:s:${number}`, "--bind", `name:s:${name}`, "--bind", `type:i:${type}`, "--bind", `date:l:${now - ago}`, "--bind", `duration:i:${secs}`);
adb("shell", "content", "delete", "--uri", "content://call_log/calls");
call("+919800000001", "Ravi", 1, 86400000, 300);
call("+919800000002", "Priya", 3, 3600000, 0);
call("+919811111111", "Dentist", 1, 7200000, 60);

adb("shell", "am", "start", "-n", `${APP}/.MainActivity`);
// Playwright's Android driver attaches to the app's web view over adb.
const [device] = await android.devices();
if (!device) throw new Error("No emulator or phone is connected.");
const page = await (await device.webView({ pkg: APP }, { timeout: 60000 })).page();
page.setDefaultTimeout(30000);
check("the app opens the My Equal pages", /My Equal/.test(await page.title()) || (await page.content()).includes("My Equal"), page.url());
check("the native bridge is there", await page.evaluate(() => Boolean(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.Equal)));
check("sign-in uses the phone's own Google button", await page.getByRole("button", { name: "Continue with Google" }).waitFor().then(() => true, () => false));

// Sign in to a test account that has Ravi and Priya (sample life).
await page.evaluate(() => fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "9000000009", name: "Demo Tester", secret: "localtest" }) }));
await page.reload();
await page.getByLabel("Settings").waitFor();
await wait(3000);
await page.getByLabel("Settings").dispatchEvent("click");
const settings = await page.evaluate(() => document.body.innerText);
const m = settings.match(/(\d+) calls in the last 90 days matched people here(; (\d+) numbers matched nobody)?/);
check("the call log is read and matched on the phone", Boolean(m) && m[1] === "2" && m[3] === "1", m?.[0] ?? settings.slice(0, 200));

// The number that matched nobody: the person says it is Kiran, and its call now counts.
await page.getByRole("button", { name: "Say who this number is" }).dispatchEvent("click");
const sheet = page.getByRole("dialog", { name: "Match calls to people" });
await sheet.getByLabel("Who is Dentist").selectOption({ label: "Kiran" });
await sheet.getByText("is Kiran").waitFor();
await sheet.getByRole("button", { name: "Done" }).dispatchEvent("click");
const after = (await page.evaluate(() => document.body.innerText)).match(/(\d+) calls in the last 90 days matched people here(; (\d+) numbers matched nobody)?/);
check("a number linked by hand counts for that person", after?.[1] === "3" && !after?.[3], after?.[0]);
const kept = await page.evaluate(() => localStorage.getItem("equal-call-links") ?? "");
check("the link is kept on the phone", kept.includes("9811111111"));
await page.getByLabel("Close settings").dispatchEvent("click");

const touches = await page.evaluate(async () => {
  const s = await (await fetch("/api/state")).json();
  return JSON.stringify(s.touches ?? []);
});
check("the server never got the phone's calls or links", !touches.includes("ph-") && !touches.includes("9811111111"));

// Reminders the phone shows by itself: planned on the phone and handed to Android.
await page.getByLabel("Settings").dispatchEvent("click");
await page.getByRole("button", { name: /Reminders on this phone are on/ }).waitFor();
const planned = Number((await page.evaluate(() => document.body.innerText)).match(/(\d+) reminders? in the next two weeks/)?.[1] ?? 0);
const pending = await page.evaluate(async () => (await window.Capacitor.Plugins.LocalNotifications.getPending()).notifications.length);
check("the next two weeks of reminders are planned on the phone and handed to Android", planned > 0 && pending === planned, `${planned} planned, ${pending} waiting in Android`);
await page.getByLabel("Close settings").dispatchEvent("click");

// One comes due with the app closed: it is shown by Android itself.
const TITLE = `Time to talk to Amma (test ${Date.now() % 100000})`;
await page.evaluate((title) => window.Capacitor.Plugins.LocalNotifications.schedule({ notifications: [{ id: 4242, title, body: "You wanted to be in touch every 3 days.", isExactNotification: false, schedule: { at: new Date(Date.now() + 15000), allowWhileIdle: true } }] }), TITLE);
adb("shell", "input", "keyevent", "KEYCODE_HOME");
await wait(2000);
adb("shell", "am", "kill", APP); // the app's process is gone, as when the phone reclaims it
await wait(2000);
let shown = false;
for (let i = 0; i < 20 && !shown; i++) {
  await wait(2000);
  shown = adb("shell", "dumpsys", "notification", "--noredact").includes(TITLE);
}
check("a reminder is shown by Android with the app closed", shown);
adb("shell", "cmd", "statusbar", "expand-notifications");
await wait(1500);

const shot = path.join(process.env.TEMP ?? ".", "my-equal-emulator.png");
adb("shell", "screencap", "-p", "/sdcard/shot.png");
adb("pull", "/sdcard/shot.png", shot);
console.log("   screenshot:", shot);
try {
  await device.close();
} catch {
  // the web view went away with the app
}
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);
process.exit(results.every(Boolean) ? 0 : 1);
