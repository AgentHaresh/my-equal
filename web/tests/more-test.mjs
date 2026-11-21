// Test of send later, starred messages and export. Usage: node tests/more-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const asha = await signIn(B, `more-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `more-bala-${stamp}@example.com`, "Bala");
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const thread = (s, contactId) => s.messages.filter((m) => m.contactId === contactId && m.from !== "butler");
const later = (who, body) => who.call("/api/scheduled", "POST", body);

// --- send later
let a = await asha.json("/api/messages", "POST", { contactId: toBala, text: "Hello Bala" });
const hello = thread(a, toBala).at(-1);
let b = await bala.json("/api/state");
const toAsha = b.contacts.find((c) => c.userId === asha.user.id).id;

let res = await later(asha, { action: "set", contactId: toBala, text: "Happy birthday Bala!", when: new Date(Date.now() + 7000).toISOString() });
a = await res.json();
const item = a.scheduled?.find((s) => s.text === "Happy birthday Bala!");
check("a message can be set to send later", res.status === 200 && Boolean(item));
check("it is not in the chat yet, on either side", !thread(a, toBala).some((m) => /birthday/.test(m.text)) && !thread(await bala.json("/api/state"), toAsha).some((m) => /birthday/.test(m.text)));
check("the other person cannot see that it is waiting", (await bala.json("/api/state")).scheduled.length === 0);
check("a time in the past is refused", (await later(asha, { action: "set", contactId: toBala, text: "late", when: new Date(Date.now() - 3600000).toISOString() })).status === 400);
check("it cannot be scheduled to a chat that is not mine", (await later(bala, { action: "set", contactId: toBala, text: "x", when: new Date(Date.now() + 60000).toISOString() })).status === 400);
check("sending later needs sign-in", (await later(anon(B), { action: "set", contactId: toBala, text: "x", when: new Date(Date.now() + 60000).toISOString() })).status === 401);

// A second one, cancelled before its time.
a = await (await later(asha, { action: "set", contactId: toBala, text: "Never mind this one", when: new Date(Date.now() + 6000).toISOString() })).json();
const second = a.scheduled.find((s) => s.text === "Never mind this one");
check("another person cannot cancel my waiting message", (await later(bala, { action: "cancel", id: second.id })).status === 404);
a = await (await later(asha, { action: "cancel", id: second.id })).json();
check("a waiting message can be cancelled", !a.scheduled.some((s) => s.id === second.id));

// Only the receiver looks at the app while we wait: the server sends it without the sender present.
let arrived = false;
for (let i = 0; i < 24 && !arrived; i++) {
  await wait(1000);
  arrived = thread(await bala.json("/api/state"), toAsha).some((m) => m.text === "Happy birthday Bala!");
}
check("it is delivered at its time, without the sender opening the app", arrived);
await wait(1500);
a = await asha.json("/api/state");
b = await bala.json("/api/state");
check("it is sent exactly once", thread(a, toBala).filter((m) => /birthday/.test(m.text)).length === 1 && thread(b, toAsha).filter((m) => /birthday/.test(m.text)).length === 1);
check("it leaves the waiting list", a.scheduled.length === 0);
check("the cancelled one never arrives", !thread(b, toAsha).some((m) => /Never mind/.test(m.text)));
check("an already-sent one cannot be cancelled", (await later(asha, { action: "cancel", id: item.id })).status === 404);

// --- starred
const helloAtBala = thread(b, toAsha).find((m) => m.text === "Hello Bala");
b = await (await bala.call("/api/messages", "PATCH", { id: helloAtBala.id, starred: true })).json();
check("I can star someone else's message", thread(b, toAsha).find((m) => m.id === helloAtBala.id)?.starred === true);
a = await asha.json("/api/state");
check("a star is private: the sender does not see it", !thread(a, toBala).find((m) => m.id === hello.id)?.starred);
b = await (await bala.call("/api/messages", "PATCH", { id: helloAtBala.id, starred: false })).json();
check("a star can be removed", !thread(b, toAsha).find((m) => m.id === helloAtBala.id)?.starred);
check("I cannot star a message in someone else's space", (await bala.call("/api/messages", "PATCH", { id: hello.id, starred: true })).status === 404);
await asha.call("/api/messages", "PATCH", { id: hello.id, starred: true });

// --- export
res = await asha.call(`/api/export?contactId=${toBala}`);
const txt = await res.text();
check("one chat exports as a text file", res.status === 200 && /attachment/.test(res.headers.get("content-disposition") ?? "") && /text\/plain/.test(res.headers.get("content-type") ?? ""));
check("it has each message with date, time and name", /^\[\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}\] Asha: Hello Bala$/m.test(txt) && /Asha: Happy birthday Bala!/.test(txt), txt.slice(0, 200));
check("Equal's private notes are left out", !/only you see this|Equal ·/.test(txt));
res = await asha.call("/api/export");
const all = await res.json();
check("everything exports as one file", res.status === 200 && all.contacts.length > 1 && all.messages.some((m) => m.text === "Hello Bala" && m.starred) && Array.isArray(all.memories));
check("another person's chat cannot be exported", (await bala.call(`/api/export?contactId=${toBala}`)).status === 404);
check("export needs sign-in", (await anon(B).call("/api/export")).status === 401);

finish();
