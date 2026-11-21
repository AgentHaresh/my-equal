// Test of voice notes, drafting a message, and forgetting a memory. Usage: node tests/extras-test.mjs <base-url>
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const me = await signIn(B, `test-extras-${Date.now().toString(36)}@example.com`, "Extras Tester");
const link = anon(B);

// --- Voice note. Borrow some real speech: Equal's opening line from a screened call.
const call = await link.json("/api/ring", "POST", { u: me.user.id, c: "unknown-nanna" });
const speech = await (await fetch(`${B}/api/ring?id=${call.id}&n=0`)).arrayBuffer();
const before = (await me.json("/api/state")).messages.filter((m) => m.contactId === "ravi").length;
const form = new FormData();
form.append("contactId", "ravi");
form.append("audio", new Blob([speech], { type: "audio/mpeg" }), "note.mp3");
let res = await fetch(B + "/api/voicenote", { method: "POST", headers: { cookie: me.cookie }, body: form });
let s = await res.json();
const sent = s.messages?.filter((m) => m.contactId === "ravi").at(-1);
check("a voice note is transcribed and sent", res.status === 200 && s.messages.filter((m) => m.contactId === "ravi").length === before + 1 && /AI assistant/i.test(sent?.text ?? ""), sent?.text ?? s.error);
check("it is marked as a voice note with its language", Boolean(sent?.voice) && /english/i.test(sent?.voice?.language ?? ""), JSON.stringify(sent?.voice));
check("an English note is not given a translation", !sent?.voice?.english);
check("voice notes need sign-in", (await fetch(B + "/api/voicenote", { method: "POST", body: form })).status === 401);
const tiny = new FormData();
tiny.append("contactId", "ravi");
tiny.append("audio", new Blob([new Uint8Array(100)]), "x.webm");
check("a too-short recording is refused", (await fetch(B + "/api/voicenote", { method: "POST", headers: { cookie: me.cookie }, body: tiny })).status === 400);

// --- Drafting a message in my own voice. It must not be sent.
const count = (await me.json("/api/state")).messages.length;
const d = await me.json("/api/draft", "POST", { contactId: "anna", about: "Eye check-up at LV Prasad (was on Thursday)" });
check("a draft is written", typeof d.draft === "string" && d.draft.length > 10, d.draft || d.error);
check("the draft mentions what to ask about", /check|eye|lv prasad/i.test(d.draft ?? ""), d.draft);
check("the draft is not sent", (await me.json("/api/state")).messages.length === count);
check("drafting needs sign-in", (await link.call("/api/draft", "POST", { contactId: "anna" })).status === 401);

// --- Forgetting something it remembered.
s = await me.json("/api/state");
const memory = s.memories.find((m) => m.contactId === "anna");
s = await me.json("/api/memories", "POST", { id: memory.id });
check("I can make it forget something", !s.memories.some((m) => m.id === memory.id));
check("forgetting something unknown is refused", (await me.call("/api/memories", "POST", { id: "nope" })).status === 404);
check("forgetting needs sign-in", (await link.call("/api/memories", "POST", { id: memory.id })).status === 401);

finish();
