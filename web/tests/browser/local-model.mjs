// The real app, two browsers: Asha writes privately; Bala's browser reads it with the on-device model.
// Checks: a reminder appears from a promise, tone is noted privately, and the server learns nothing.
// Usage (from web/): start a test server (TEST_LOGIN_SECRET=localtest npx next start -p 3217), then
//   CHROME_PATH=<chromium or chrome> node tests/browser/local-model.mjs <output-folder>
// Needs a GPU with WebGPU. The model is downloaded once into <output-folder>/app-profile.
// Not part of tests/run-all.mjs: it needs a GPU and takes minutes.
import path from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2];
const B = "http://localhost:3217";
const stamp = Date.now().toString(36);
const exe = process.env.CHROME_PATH;
const args = ["--enable-unsafe-webgpu"];
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const post = (page, url, body) => page.evaluate(async ([url, body]) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(), [url, body]);
const state = (page) => page.evaluate(async () => (await fetch("/api/state")).json());

async function person(ctx, email, name) {
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.setDefaultTimeout(30000);
  await page.goto(B);
  const user = (await post(page, "/api/auth", { email, name, secret: "localtest" })).user;
  await post(page, "/api/demo", { on: false });
  await page.reload();
  await page.waitForFunction(async () => ((await (await fetch("/api/state")).json()).me?.keyIds ?? []).length > 0, null, { timeout: 20000 });
  return { page, user };
}

const browserA = await chromium.launch({ executablePath: exe, args });
const asha = await person(await browserA.newContext(), `local-asha-${stamp}@example.com`, "Asha");
// Bala keeps a profile on disk, so the model is downloaded once across runs.
const balaCtx = await chromium.launchPersistentContext(path.join(out, "app-profile"), { executablePath: exe, headless: true, args, viewport: { width: 1280, height: 1400 } });
const bala = await person(balaCtx, `local-bala-${stamp}@example.com`, "Bala");

const toBala = (await post(asha.page, "/api/chats", { userId: bala.user.id })).contactId;
const toAsha = (await post(bala.page, "/api/chats", { userId: asha.user.id })).contactId;
await post(asha.page, "/api/keys", { privateMode: true });
await post(bala.page, "/api/contacts", { contactId: toAsha, family: true }); // so tone nudges apply

// Bala turns on Equal on this device from Settings.
await post(bala.page, "/api/keys", { privateMode: true });
await bala.page.reload();
await bala.page.getByLabel("Settings").click();
await bala.page.waitForTimeout(1500);
console.log("   settings menu:", JSON.stringify((await bala.page.locator("div.absolute.right-0").first().innerText().catch(() => "?")).replace(/\n/g, " | ")));
console.log("   me:", JSON.stringify((await state(bala.page)).me));
await bala.page.screenshot({ path: `${out}/local-settings.png` });
await bala.page.getByRole("button", { name: /Let Equal read private chats here/ }).click();
await bala.page.getByRole("button", { name: /Equal on this device is on/ }).waitFor();
check("Equal on this device can be turned on", true);
await bala.page.getByLabel("Close settings").click();

// Asha writes two private messages from her screen.
await asha.page.reload();
await asha.page.goto(`${B}/?c=${encodeURIComponent(toBala)}`);
await asha.page.getByText("🔒 Private").first().waitFor({ timeout: 15000 });
const box = asha.page.locator("textarea, input[placeholder*='essage']").last();
for (const text of ["I'll book the train tickets tomorrow and send you the PDF.", "Honestly I'm feeling really low today. Nothing is going right and I miss home."]) {
  await box.fill(text);
  await box.press("Enter");
  await asha.page.getByText(text).first().waitFor({ timeout: 15000 });
}

// Bala's browser downloads and starts the model, then reads both messages on the device.
const t0 = Date.now();
await bala.page.goto(B);
let mind = null;
for (let i = 0; i < 180; i++) {
  mind = await bala.page.evaluate(
    (id) =>
      new Promise((resolve) => {
        const req = indexedDB.open("my-equal-mind", 1);
        req.onsuccess = () => {
          try {
            const get = req.result.transaction("mind").objectStore("mind").get(id);
            get.onsuccess = () => resolve(get.result ?? null);
            get.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      }),
    bala.user.id,
  );
  if (mind && Object.keys(mind.read ?? {}).length >= 2) break;
  if (i % 6 === 0) {
    const status = await bala.page.evaluate(() => document.body.innerText.match(/(Fetching|Loading|Start)[^\n]{0,80}/)?.[0] ?? "");
    if (status) console.log("   ", status);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
const secs = Math.round((Date.now() - t0) / 1000);
check("both private messages were read on the device", Object.keys(mind?.read ?? {}).length >= 2, `${secs} s including any download and model start`);
console.log("   facts:", JSON.stringify((mind?.facts ?? []).map((f) => [f.about, f.kind, f.fact, f.when])));
console.log("   tones:", JSON.stringify(mind?.tones ?? {}));
check("the promise made to Bala is remembered on his device", (mind?.facts ?? []).some((f) => /ticket|pdf/i.test(f.fact)));
check("Asha's low mood is noted on his device", Object.values(mind?.tones ?? {}).some((t) => ["sad", "lonely", "stressed", "upset", "tired", "hurt", "worried"].includes(t.mood)));

// It shows on Bala's screen: a reminder from the promise, and a check-in card.
await bala.page.reload();
await bala.page.waitForTimeout(3000);
const home = await bala.page.evaluate(() => document.body.innerText);
check("a reminder from the private promise is on the home screen", /ticket|pdf/i.test(home.split("For you")[0] ?? ""), "");
check("a check-in card is shown", /Check in|sounded/i.test(home));
await bala.page.screenshot({ path: `${out}/local-home.png`, fullPage: true });

// The server learned nothing: no memories or tone about Asha in Bala's server-side state.
const s = await state(bala.page);
check("the server holds no memories from the private chat", !s.memories.some((m) => m.contactId === toAsha));
check("the server holds no tone for the private messages", !s.messages.some((m) => m.contactId === toAsha && m.tone));
check("the server holds no readable words of them", !JSON.stringify(s).includes("tickets") && !JSON.stringify(s).includes("miss home"));

await browserA.close();
await balaCtx.close();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);
