// Test of reactions, forwarding, sending only what changed, live updates and notification set-up.
// Usage: node tests/live-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const asha = await signIn(B, `live-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `live-bala-${stamp}@example.com`, "Bala");
const chitra = await signIn(B, `live-chitra-${stamp}@example.com`, "Chitra");
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const toChitra = (await asha.json("/api/chats", "POST", { userId: chitra.user.id })).contactId;
const thread = (s, contactId) => s.messages.filter((m) => m.contactId === contactId && m.from !== "butler");

let a = await asha.json("/api/messages", "POST", { contactId: toBala, text: "The venue is Equal HQ, second floor." });
const venue = thread(a, toBala).at(-1);
let b = await bala.json("/api/state");
const toAsha = b.contacts.find((c) => c.userId === asha.user.id).id;
const venueAtBala = thread(b, toAsha).at(-1);

// --- reactions
b = await bala.json("/api/messages", "PATCH", { id: venueAtBala.id, reaction: "👍" });
check("I can react to a message", thread(b, toAsha).find((m) => m.id === venueAtBala.id)?.reactions?.me === "👍");
a = await asha.json("/api/state");
check("the sender sees my reaction as theirs to see", thread(a, toBala).find((m) => m.id === venue.id)?.reactions?.them === "👍");
a = await asha.json("/api/messages", "PATCH", { id: venue.id, reaction: "❤️" });
b = await bala.json("/api/state");
const both = thread(b, toAsha).find((m) => m.id === venueAtBala.id)?.reactions;
check("each of us has our own reaction", both?.me === "👍" && both?.them === "❤️");
b = await bala.json("/api/messages", "PATCH", { id: venueAtBala.id, reaction: "👍" });
check("choosing the same reaction again takes it off", !thread(b, toAsha).find((m) => m.id === venueAtBala.id)?.reactions?.me);
check("only the offered reactions are accepted", (await bala.call("/api/messages", "PATCH", { id: venueAtBala.id, reaction: "<b>x</b>" })).status === 404);
check("I cannot react in someone else's space", (await chitra.call("/api/messages", "PATCH", { id: venue.id, reaction: "👍" })).status === 404);

// --- forwarding
a = await asha.json("/api/messages", "POST", { forwardOf: venue.id, contactId: toChitra });
const fwd = thread(a, toChitra).at(-1);
check("a message can be forwarded to another chat", fwd?.text === venue.text && fwd.forwarded === true);
const c = await chitra.json("/api/state");
const cFromAsha = c.contacts.find((x) => x.userId === asha.user.id).id;
check("the receiver sees it marked as forwarded", thread(c, cFromAsha).at(-1)?.forwarded === true && thread(c, cFromAsha).at(-1).text === venue.text);
check("the original is not marked forwarded", !thread(a, toBala).find((m) => m.id === venue.id)?.forwarded);
check("someone else's message cannot be forwarded by its id", (await chitra.call("/api/messages", "POST", { forwardOf: venue.id, contactId: cFromAsha })).status === 404);
check("forwarding needs sign-in", (await anon(B).call("/api/messages", "POST", { forwardOf: venue.id, contactId: toChitra })).status === 401);

// --- only what changed
let res = await asha.call("/api/state");
const fullText = await res.text();
const v = JSON.parse(fullText).v;
res = await asha.call(`/api/state?v=${v}`);
const sameText = await res.text();
check("the state carries a version", typeof v === "string" && v.length >= 8);
check("when nothing has changed, the answer is tiny", JSON.parse(sameText).same === true && sameText.length < 60, `${sameText.length} bytes vs ${fullText.length}`);
await bala.json("/api/messages", "POST", { contactId: toAsha, text: "Got it, see you there." });
res = await asha.call(`/api/state?v=${v}`);
const changed = await res.json();
check("after a change, the full state comes back with a new version", Array.isArray(changed.messages) && changed.v !== v);

// --- live: the server tells an open app at once
const controller = new AbortController();
res = await fetch(B + "/api/live", { headers: { cookie: asha.cookie }, signal: controller.signal });
check("the live line opens", res.status === 200 && /event-stream/.test(res.headers.get("content-type") ?? ""));
const reader = res.body.getReader();
const decoder = new TextDecoder();
let told = null;
const listening = (async () => {
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    if (/data: changed/.test(decoder.decode(value)) && told === null) told = performance.now();
  }
})().catch(() => {});
await wait(400);
const sentAt = performance.now();
await bala.call("/api/messages", "POST", { contactId: toAsha, text: "One more thing." });
for (let i = 0; i < 40 && told === null; i++) await wait(50);
check("an open app is told the moment something changes", told !== null, told === null ? "no nudge within 2 s" : `${Math.round(told - sentAt)} ms after sending`);
controller.abort();
await listening;
check("the live line needs sign-in", (await anon(B).call("/api/live")).status === 401);

// --- notifications: set-up
res = await asha.call("/api/push");
const key = (await res.json()).key;
check("the server offers a notification key", res.status === 200 && typeof key === "string" && key.length > 60);
check("the key is the same next time", (await asha.json("/api/push")).key === key);
check("something that is not a subscription is refused", (await asha.call("/api/push", "POST", { subscription: { endpoint: "ftp://x" } })).status === 400);
check("notification set-up needs sign-in", (await anon(B).call("/api/push")).status === 401);
check("before agreeing, notifications are off", (await asha.json("/api/push")).on === false);

finish();
