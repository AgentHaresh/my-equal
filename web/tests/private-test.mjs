// Test of private (end-to-end encrypted) chats. This script plays two phones: each makes its own
// key, locks its messages before sending, and unlocks what arrives. The server must store and
// relay the messages without ever holding their words.
// Usage: node tests/private-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";
import { exportPublic, makeKeyPair, open, seal, sharedKey } from "../lib/e2e.ts";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const stamp = Date.now().toString(36);
const asha = await signIn(B, `private-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `private-bala-${stamp}@example.com`, "Bala");
const chitra = await signIn(B, `private-chitra-${stamp}@example.com`, "Chitra");
for (const p of [asha, bala, chitra]) await p.json("/api/demo", "POST", { on: false });

const phone = async () => {
  const pair = await makeKeyPair();
  return { pair, pub: await exportPublic(pair) };
};
const aPhone = await phone();
const bPhone = await phone();

// --- Keys: only a well-formed public key is accepted.
const { d: _unused, ...rest } = { d: 1, ...aPhone.pub.jwk };
void _unused;
check("a key with a private part is refused", (await asha.call("/api/keys", "POST", { key: { id: aPhone.pub.id, jwk: { ...rest, d: "c2VjcmV0" } } })).status === 400);
check("a key whose id does not match is refused", (await asha.call("/api/keys", "POST", { key: { id: "0000000000000000", jwk: aPhone.pub.jwk } })).status === 400);
check("private chats cannot be turned on before there is a key", (await chitra.call("/api/keys", "POST", { privateMode: true })).status === 400);
let a = await asha.json("/api/keys", "POST", { key: aPhone.pub });
check("a phone registers its public key", a.me?.keyIds?.includes(aPhone.pub.id));
await bala.json("/api/keys", "POST", { key: bPhone.pub });
a = await asha.json("/api/keys", "POST", { privateMode: true });
check("private chats can be turned on", a.me?.privateMode === true);
check("registering needs sign-in", (await anon(B).call("/api/keys", "POST", { key: aPhone.pub })).status === 401);

// --- Asha writes to Bala privately.
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const toAsha = (await bala.json("/api/chats", "POST", { userId: asha.user.id })).contactId;
a = await asha.json("/api/state");
const balaKey = a.contacts.find((c) => c.id === toBala)?.peer?.keys?.at(-1);
check("my phone gets the other person's public key", balaKey?.id === bPhone.pub.id);
const kA = await sharedKey(aPhone.pair.privateKey, aPhone.pub.id, balaKey);
const SECRET = `Amma's surgery is on Friday, keep it quiet ${stamp}`;
const sealed = await seal(kA, SECRET, aPhone.pub.id, bPhone.pub.id);
a = await asha.json("/api/messages", "POST", { contactId: toBala, enc: sealed });
const mine = a.messages?.find((m) => m.enc?.iv === sealed.iv);
check("a private message is sent", Boolean(mine) && mine.text === "" && !a.error, a.error ?? "");

let b = await bala.json("/api/state");
const got = b.messages.find((m) => m.contactId === toAsha && m.enc?.iv === sealed.iv);
check("it arrives with no words, only ciphertext", Boolean(got) && got.text === "");
const ashaKey = b.contacts.find((c) => c.id === toAsha)?.peer?.keys?.find((k) => k.id === got.enc.k);
const kB = await sharedKey(bPhone.pair.privateKey, bPhone.pub.id, ashaKey);
check("and only Bala's phone can unlock it", (await open(kB, got.enc)) === SECRET);
const everything = JSON.stringify([a, b, await asha.call("/api/export").then((r) => r.text()), await bala.call(`/api/export?contactId=${encodeURIComponent(toAsha)}`).then((r) => r.text())]);
check("the words appear nowhere the server can show", !everything.includes("surgery") && !everything.includes(stamp + '"'));
check("the export says a private message is there", /private message, readable only on your phone/.test(await bala.call(`/api/export?contactId=${encodeURIComponent(toAsha)}`).then((r) => r.text())));
check("who wrote when is still known, so staying in touch still works", b.contacts.find((c) => c.id === toAsha)?.lastContactAt === got.at);

// --- What the server refuses.
const stranger = await phone();
const forged = await seal(kA, "x", aPhone.pub.id, stranger.pub.id);
check("a message locked for an unknown key is refused", (await asha.call("/api/messages", "POST", { contactId: toBala, enc: forged })).status === 400);
check("a private message cannot go to a sample or unknown chat", (await asha.call("/api/messages", "POST", { contactId: "ravi", enc: sealed })).status === 400);
check("a malformed private message is refused", (await asha.call("/api/messages", "POST", { contactId: toBala, enc: { ...sealed, ct: "<b>hi</b>" } })).status === 400);
check("the server will not forward what it cannot read", (await asha.call("/api/messages", "POST", { forwardOf: mine.id, contactId: toBala })).status === 400);
check("a private message cannot be edited into plain words", (await asha.call("/api/messages", "PATCH", { id: mine.id, text: "now readable" })).status === 400);

// --- Editing locks the new words too.
const edited = await seal(kA, `Surgery moved to Saturday ${stamp}`, aPhone.pub.id, bPhone.pub.id);
a = await asha.json("/api/messages", "PATCH", { id: mine.id, enc: edited });
b = await bala.json("/api/state");
const theirEdit = b.messages.find((m) => m.pair === got.pair);
check("an edit reaches the other phone, still locked", theirEdit?.enc?.iv === edited.iv && Boolean(theirEdit?.editedAt) && (await open(kB, theirEdit.enc)).startsWith("Surgery moved"));

// --- Bala replies privately; Asha's phone unlocks it.
const kB2 = await sharedKey(bPhone.pair.privateKey, bPhone.pub.id, ashaKey);
const reply = await seal(kB2, "Ok, I won't tell anyone. I'll call you tonight.", bPhone.pub.id, aPhone.pub.id);
await bala.json("/api/messages", "POST", { contactId: toAsha, enc: reply });
a = await asha.json("/api/state");
const back = a.messages.find((m) => m.enc?.iv === reply.iv);
check("a private reply unlocks on the first phone", back?.from === "them" && (await open(kA, back.enc)) === "Ok, I won't tell anyone. I'll call you tonight.");

// --- Send later keeps the words locked while it waits.
const later = await seal(kA, "Reminder: Friday", aPhone.pub.id, bPhone.pub.id);
a = await asha.json("/api/scheduled", "POST", { action: "set", contactId: toBala, enc: later, when: new Date(Date.now() + 3600000).toISOString() });
const waiting = a.scheduled?.find((s) => s.enc?.iv === later.iv);
check("a private message can wait to be sent, still locked", Boolean(waiting) && waiting.text === "", a.error ?? "");

// --- Equal on the server cannot read private chats, so it learns nothing from them.
await new Promise((r) => setTimeout(r, 4000));
a = await asha.json("/api/state");
check("nothing is remembered from a private chat on the server", !a.memories.some((m) => m.contactId === toBala));

finish();
