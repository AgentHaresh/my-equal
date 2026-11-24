// The lock on Equal's memory on the device, in a real browser with a virtual passkey that has PRF.
// Checks: locking seals what is already remembered, a reload locks it, the passkey and the recovery code
// open it, a wrong code does not, "lock now" hides it, and forgetting removes it.
// Usage (from web/): start a test server (TEST_LOGIN_SECRET=localtest npx next start -p 3217), then
//   CHROME_PATH=<chromium or chrome> node tests/browser/memory-lock.mjs
// Needs no GPU: the model is not started (there are no private messages to read).
import { chromium } from "playwright-core";

const B = "http://localhost:3217";
const stamp = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const post = (page, url, body) => page.evaluate(async ([url, body]) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(), [url, body]);

// Everything in the my-equal-mind store, as text.
const stored = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("my-equal-mind", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("mind");
        req.onsuccess = () => {
          const out = {};
          const tx = req.result.transaction("mind");
          const cur = tx.objectStore("mind").openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) return resolve(out);
            out[c.key] = c.value;
            c.continue();
          };
        };
      }),
  );

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });

async function person(email, name) {
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(20000);
  await page.goto(B);
  const user = (await post(page, "/api/auth", { email, name, secret: "localtest" })).user;
  await post(page, "/api/demo", { on: false });
  await page.reload();
  await page.waitForFunction(async () => ((await (await fetch("/api/state")).json()).me?.keyIds ?? []).length > 0, null, { timeout: 20000 });
  return { page, user };
}

const asha = await person(`lock-asha-${stamp}@example.com`, "Asha");
const bala = await person(`lock-bala-${stamp}@example.com`, "Bala");
const toAsha = (await post(bala.page, "/api/chats", { userId: asha.user.id })).contactId;
await post(bala.page, "/api/keys", { privateMode: true });

// A virtual platform passkey with PRF, unlocked by "fingerprint".
const cdp = await bala.page.context().newCDPSession(bala.page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });

// Equal on this device is on, and already remembers one promise (as if read earlier, before the lock).
const tomorrow = new Date(Date.now() + 86400000).toISOString();
await bala.page.evaluate(
  ([id, fact]) =>
    new Promise((resolve) => {
      localStorage.setItem(`equal-local-${id}`, "on");
      const req = indexedDB.open("my-equal-mind", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("mind");
      req.onsuccess = () => {
        const tx = req.result.transaction("mind", "readwrite");
        tx.objectStore("mind").put({ facts: [fact], tones: {}, read: {} }, id);
        tx.oncomplete = () => resolve();
      };
    }),
  [bala.user.id, { id: "Ltest1", contactId: toAsha, fact: "Asha: I'll book the train tickets and send you the PDF.", kind: "promise", about: "contact", when: tomorrow, status: "open", createdAt: new Date().toISOString(), local: true }],
);
const home = async () => {
  await bala.page.waitForTimeout(1500);
  return bala.page.evaluate(() => document.body.innerText);
};
const openSettings = async () => {
  await bala.page.getByLabel("Settings").click();
  await bala.page.waitForTimeout(500);
};
await bala.page.reload();
check("before the lock, the remembered promise shows", /train tickets/.test(await home()));

// Lock it.
await openSettings();
await bala.page.getByRole("button", { name: /Lock Equal's memory here/ }).click();
const code = (await bala.page.getByTestId("recovery-code").innerText()).trim();
check("a recovery code is shown once", /^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/.test(code), code.replace(/[A-Z2-9]/g, "•"));
await bala.page.getByRole("button", { name: /I have kept it/ }).click();
const menu = await bala.page.evaluate(() => document.body.innerText);
check("it is locked with the passkey", /Locked with this phone's passkey/.test(menu));
const disk = await stored(bala.page);
const raw = JSON.stringify(disk);
check("on disk the memory is sealed: no words of it remain", Boolean(disk[bala.user.id]?.sealed) && !/tickets|PDF|Asha/.test(raw));
check("on disk the memory key is not stored in the clear", Boolean(disk[`vault:${bala.user.id}`]?.passkey && disk[`vault:${bala.user.id}`]?.code));
await bala.page.getByLabel("Close settings").click();
check("while unlocked, the promise still shows", /train tickets/.test(await home()));

// Closing the app locks it.
await bala.page.reload();
check("after reopening, the promise is hidden", !/train tickets/.test(await home()));
await openSettings();
check("settings say it is locked", /memory here is locked/.test(await bala.page.evaluate(() => document.body.innerText)));
await bala.page.getByRole("button", { name: /Unlock with passkey/ }).click();
await bala.page.getByRole("button", { name: /Lock Equal's memory now/ }).waitFor();
await bala.page.getByLabel("Close settings").click();
check("the passkey opens it", /train tickets/.test(await home()));

// The recovery code, and a wrong one.
await bala.page.reload();
await openSettings();
await bala.page.getByLabel("Recovery code").fill("AAAA-BBBB-CCCC-DDDD-EEEE-FFFF");
await bala.page.getByRole("button", { name: "Unlock", exact: true }).click();
await bala.page.getByText("That recovery code does not open it.").waitFor();
check("a wrong recovery code does not open it", true);
await bala.page.getByLabel("Recovery code").fill(code.toLowerCase().replace(/-/g, " "));
await bala.page.getByRole("button", { name: "Unlock", exact: true }).click();
await bala.page.getByRole("button", { name: /Lock Equal's memory now/ }).waitFor({ timeout: 30000 });
await bala.page.getByLabel("Close settings").click();
check("the recovery code opens it, typed loosely", /train tickets/.test(await home()));

// Lock now.
await openSettings();
await bala.page.getByRole("button", { name: /Lock Equal's memory now/ }).click();
await bala.page.getByRole("button", { name: /Unlock with passkey/ }).waitFor();
await bala.page.getByLabel("Close settings").click();
check("lock now hides it at once", !/train tickets/.test(await home()));

// Lost both: forget it all.
await openSettings();
await bala.page.getByRole("button", { name: /Lost the passkey and the code/ }).click();
await bala.page.getByRole("button", { name: /Tap again: forget it all/ }).click();
await bala.page.getByRole("button", { name: /Lock Equal's memory here/ }).waitFor();
const after = await stored(bala.page);
check("forgetting removes the memory and its lock", !after[bala.user.id] && !after[`vault:${bala.user.id}`]);

await browser.close();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);
process.exit(results.every(Boolean) ? 0 : 1);
