// Test of an empty start, the opt-in demo, read receipts, unread counts and last seen, and the
// files that make it installable as an app. Usage: node tests/product-test.mjs <base-url>
import { signIn, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);
const asha = await signIn(B, `prod-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `prod-bala-${stamp}@example.com`, "Bala");
const thread = (s, contactId) => s.messages.filter((m) => m.contactId === contactId && m.from !== "butler");

// --- the demo chats can be taken away and brought back; real chats are never touched
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
await asha.json("/api/messages", "POST", { contactId: toBala, text: "Hi Bala, are you coming on Sunday?" });
let a = await asha.json("/api/demo", "POST", { on: false });
check("with the demo off there are no made-up people", !a.contacts.some((c) => c.sample) && a.demo === false, a.contacts.map((c) => c.name).join(", "));
check("nor anything remembered or suggested about them", a.memories.every((m) => m.contactId === toBala || m.contactId === "self") && a.suggestions.every((s) => s.contactId === toBala || s.contactId === "self"));
check("the real chat is untouched", a.contacts.length === 1 && thread(a, toBala).length === 1);
a = await asha.json("/api/state");
check("it stays off on the next load", !a.contacts.some((c) => c.sample));
a = await asha.json("/api/demo", "POST", { on: true });
check("the demo can be turned on again", a.contacts.some((c) => c.sample) && a.demo === true && thread(a, toBala).length === 1);
a = await asha.json("/api/demo", "POST", { on: false });
check("the demo needs a clear yes or no", (await asha.call("/api/demo", "POST", {})).status === 400);

// --- unread counts and read receipts
let b = await bala.json("/api/state");
const fromAsha = b.contacts.find((c) => c.userId === asha.user.id);
const unread = (s, c) => s.messages.filter((m) => m.contactId === c.id && m.from === "them" && m.at > (c.readAt ?? "9999")).length;
check("a new message from someone is unread", unread(b, fromAsha) === 1, `readAt ${fromAsha.readAt}`);
check("the sender sees it as not yet read", !thread(a, toBala)[0].readAt);
b = await bala.json("/api/read", "POST", { contactId: fromAsha.id });
check("opening the chat clears the unread count", unread(b, b.contacts.find((c) => c.id === fromAsha.id)) === 0);
a = await asha.json("/api/state");
check("the sender then sees it as read", Boolean(thread(a, toBala)[0].readAt));
await bala.json("/api/messages", "POST", { contactId: fromAsha.id, text: "Yes, I will be there." });
a = await asha.json("/api/state");
const balaContact = a.contacts.find((c) => c.id === toBala);
check("a reply is unread for me until I open it", unread(a, balaContact) === 1);
check("reading someone else's chat is refused", (await bala.call("/api/read", "POST", { contactId: toBala })).status === 404);

// --- last seen
check("someone whose app is open shows as online", a.presence[toBala] === "online", String(a.presence[toBala]));
await wait(9500);
const away = (await asha.json("/api/state")).presence[toBala];
check("once they stop checking in, it shows when they were last here", away !== "online" && !isNaN(Date.parse(away)), String(away));

// --- installable as an app
let res = await fetch(B + "/manifest.webmanifest");
const m = await res.json().catch(() => null);
check("there is an app manifest", res.status === 200 && m?.name === "My Equal" && m.display === "standalone" && m.icons?.some((i) => i.sizes === "512x512"));
res = await fetch(B + "/icon-512.png");
check("the app icon is served", res.status === 200 && res.headers.get("content-type") === "image/png");
res = await fetch(B + "/sw.js");
check("the service worker is served", res.status === 200 && /javascript/.test(res.headers.get("content-type") ?? "") && /\/api\//.test(await res.text()));
const html = await (await fetch(B + "/")).text();
check("the page links the manifest and sets the phone status bar colour", /rel="manifest"/.test(html) && /theme-color/.test(html));

finish();
