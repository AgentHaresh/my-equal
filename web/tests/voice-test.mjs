// Test of voice on a call: speech out, then that speech fed back in. Usage: node tests/voice-test.mjs <base-url>
import { signIn, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const me = await signIn(B, "test-voice@example.com", "Voice Tester");

await me.json("/api/state", "DELETE");
let s = await me.json("/api/messages", "POST", { contactId: "ravi", text: "My car broke down near Gachibowli and I need it fixed today" });
const o = s.suggestions.find((x) => x.type === "intent");
check("Equal offers help", Boolean(o), s.error ?? "");
if (!o) finish();
s = await me.json("/api/suggestions", "POST", { id: o.id, action: "accept" });
const id = s.jobs[0].calls[0].id;
await fetch(`${B}/api/calls?id=${id}`);

let t = Date.now();
const a = await fetch(`${B}/api/voice?id=${id}&n=0`);
const buf = await a.arrayBuffer();
check("speech out returns audio", a.status === 200 && buf.byteLength > 20000, `${buf.byteLength} bytes in ${Date.now() - t}ms`);
check("no audio for a line that does not exist", (await fetch(`${B}/api/voice?id=${id}&n=5`)).status === 404);

// Feed Equal's own spoken opening back in as if the provider had said it.
const form = new FormData();
form.append("id", id);
form.append("audio", new Blob([buf], { type: "audio/mpeg" }), "speech.mp3");
t = Date.now();
const r = await fetch(`${B}/api/voice`, { method: "POST", body: form });
const h = await r.json();
check("speech in is understood", r.status === 200 && /AI assistant/i.test(h.heard ?? ""), `${Date.now() - t}ms — heard: ${(h.heard ?? h.error ?? "").slice(0, 70)}`);
check("Equal replies after hearing", h.transcript?.at(-1)?.from === "butler", h.transcript?.at(-1)?.text ?? "");

const tiny = new FormData();
tiny.append("id", id);
tiny.append("audio", new Blob([new Uint8Array(100)]), "x.webm");
check("a too-short recording is rejected", (await fetch(`${B}/api/voice`, { method: "POST", body: tiny })).status === 400);

await me.json("/api/state", "DELETE");
finish();
