// Asking about a private chat, in two real browsers with the real cloud model.
// Checks: before anything private is sent, the exact lines are shown; "Ask without them" sends none;
// unticked lines are not sent; Cancel sends nothing; approved lines answer the question; the server
// keeps none of it.
// Usage (from web/): start a test server with an OpenAI key (TEST_LOGIN_SECRET=localtest npx next start -p 3217), then
//   CHROME_PATH=<chromium or chrome> node tests/browser/ask-private.mjs
import { chromium } from "playwright-core";

const B = "http://localhost:3217";
const stamp = Date.now().toString(36);
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const post = (page, url, body) => page.evaluate(async ([url, body]) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json(), [url, body]);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });

async function person(email, name) {
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(30000);
  await page.goto(B);
  const user = (await post(page, "/api/auth", { email, name, secret: "localtest" })).user;
  await post(page, "/api/demo", { on: false });
  await page.reload();
  await page.waitForFunction(async () => ((await (await fetch("/api/state")).json()).me?.keyIds ?? []).length > 0, null, { timeout: 20000 });
  return { page, user };
}

const asha = await person(`ask-asha-${stamp}@example.com`, "Asha");
const bala = await person(`ask-bala-${stamp}@example.com`, "Bala");
const toBala = (await post(asha.page, "/api/chats", { userId: bala.user.id })).contactId;
await post(bala.page, "/api/chats", { userId: asha.user.id });
await post(asha.page, "/api/keys", { privateMode: true });

// Asha writes privately.
const FLAT = "Our new flat is in Kondapur, block C. Come over on Sunday!";
await asha.page.goto(`${B}/?c=${encodeURIComponent(toBala)}`);
await asha.page.getByText("🔒 Private").first().waitFor({ timeout: 15000 });
const box = asha.page.locator("textarea, input[placeholder*='essage']").last();
const JOB = "Also, Asha here with news: I got the job at Infosys!";
for (const text of [FLAT, JOB]) {
  await box.fill(text);
  await box.press("Enter");
  await asha.page.getByText(text).first().waitFor();
}

// Bala watches what his browser sends with each question.
const sent = [];
bala.page.on("request", (r) => {
  if (r.url().endsWith("/api/ask") && r.method() === "POST") sent.push(JSON.parse(r.postData() ?? "{}"));
});
await bala.page.goto(B);
await bala.page.waitForTimeout(3000); // the private message is unlocked on his device
const ask = bala.page.getByPlaceholder("Ask me anything, or tell me what to remember");
const QUESTION = "Where is Asha's new flat?";
const sheet = bala.page.getByRole("dialog", { name: "Share private lines for this answer" });
const answerText = async () => {
  await bala.page.getByRole("button", { name: "Ask", exact: true }).waitFor();
  await bala.page.waitForFunction(() => !document.body.innerText.includes("…"), null, { timeout: 60000 }).catch(() => {});
  await bala.page.getByRole("button", { name: "Close", exact: true }).waitFor({ timeout: 60000 });
  return bala.page.getByTestId("answer").innerText();
};

// 1. Cancel sends nothing.
await ask.fill(QUESTION);
await ask.press("Enter");
await sheet.waitFor();
const shown = await sheet.innerText();
check("before anything goes, the private line is shown word for word", shown.includes(FLAT));
check("it says where it would go and that the server does not keep it", /cloud model \(OpenAI\)/.test(shown) && /does not keep them/.test(shown));
await sheet.getByRole("button", { name: "Cancel" }).click();
await bala.page.waitForTimeout(800);
check("Cancel sends nothing", sent.length === 0);

// 2. Ask without them: the question goes alone.
await ask.fill(QUESTION);
await ask.press("Enter");
await sheet.getByRole("button", { name: "Ask without them" }).click();
const without = await answerText();
check("'Ask without them' sends only the question", sent.length === 1 && !sent[0].shared);
check("without them, the answer does not know it", !/kondapur/i.test(without), without.slice(0, 100));
await bala.page.getByRole("button", { name: "Close", exact: true }).click();

// 3. An unticked line is not sent.
await ask.fill(QUESTION);
await ask.press("Enter");
check("both private lines are offered", (await sheet.getByRole("checkbox").count()) === 2);
await sheet.locator("label", { hasText: "Kondapur" }).getByRole("checkbox").uncheck();
await sheet.getByRole("button", { name: "Send 1 line and ask" }).click();
await answerText();
const partial = JSON.stringify(sent.at(-1).shared ?? {});
check("an unticked line is not sent; the ticked one is", !partial.includes("Kondapur") && partial.includes("Infosys"));
await bala.page.getByRole("button", { name: "Close", exact: true }).click();

// 4. Approved: the answer uses it.
const before = sent.length;
await ask.fill(QUESTION);
await ask.press("Enter");
await sheet.getByRole("button", { name: /^Send \d+ lines? and ask$/ }).click();
const withIt = await answerText();
check("only the approved lines are sent, once", sent.length === before + 1 && JSON.stringify(sent.at(-1).shared).includes("Kondapur"));
check("with them, the answer knows it", /kondapur/i.test(withIt), withIt.slice(0, 100));
check("the answer says private lines were used, with approval", /Used 2 lines from private chats that you approved/.test(await bala.page.locator("section").first().innerText()));

// 5. The server kept none of it.
const s = await bala.page.evaluate(async () => (await fetch("/api/state")).json());
check("the server holds no words of the private chat afterwards", !/kondapur|infosys/i.test(JSON.stringify(s)));

await browser.close();
console.log(results.every(Boolean) ? "\nALL PASSED" : `\n${results.filter((x) => !x).length} FAILED`);
process.exit(results.every(Boolean) ? 0 : 1);
