// Test of photo and file attachments, and starring people. Usage: node tests/files-test.mjs <base-url>
import fs from "fs";
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const stamp = Date.now().toString(36);
const asha = await signIn(B, `file-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `file-bala-${stamp}@example.com`, "Bala");
const chitra = await signIn(B, `file-chitra-${stamp}@example.com`, "Chitra");
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const thread = (s, contactId) => s.messages.filter((m) => m.contactId === contactId && m.from !== "butler");

const upload = (who, contactId, bytes, name, type, caption = "") => {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type }));
  form.set("contactId", contactId);
  form.set("caption", caption);
  return fetch(B + "/api/files", { method: "POST", headers: who.cookie ? { cookie: who.cookie } : {}, body: form });
};
const png = fs.readFileSync(new URL("./fixtures/appointment.png", import.meta.url));

// --- a photo
let res = await upload(asha, toBala, png, "card.png", "image/png");
let a = await res.json();
const photo = thread(a, toBala).at(-1);
check("a photo can be sent", res.status === 200 && photo?.file?.name === "card.png" && photo.file.size === png.length);
let b = await bala.json("/api/state");
const toAsha = b.contacts.find((c) => c.userId === asha.user.id).id;
const photoAtBala = thread(b, toAsha).at(-1);
check("the other person receives it", photoAtBala?.file?.id === photo.file.id && photoAtBala.from === "them");
res = await bala.call(`/api/files?id=${photo.file.id}`);
const got = Buffer.from(await res.arrayBuffer());
check("they can open it, and it is the same picture", res.status === 200 && res.headers.get("content-type") === "image/png" && got.equals(png));
check("a picture is shown in place", /^inline/.test(res.headers.get("content-disposition") ?? ""));
check("someone outside the chat cannot fetch it", (await chitra.call(`/api/files?id=${photo.file.id}`)).status === 404);
check("nor can someone who is not signed in", (await anon(B).call(`/api/files?id=${photo.file.id}`)).status === 401);

// --- a file with a caption
res = await upload(asha, toBala, Buffer.from("Day 1: Srisailam. Day 2: back home."), "trip plan.txt", "text/plain", "Here is the plan");
a = await res.json();
const doc = thread(a, toBala).at(-1);
check("a file can be sent with a caption", doc?.file?.name === "trip plan.txt" && doc.text === "Here is the plan");
res = await bala.call(`/api/files?id=${doc.file.id}`);
check("a file is offered as a download, never opened as a page", res.status === 200 && /^attachment/.test(res.headers.get("content-disposition") ?? "") && res.headers.get("content-type") === "application/octet-stream" && res.headers.get("x-content-type-options") === "nosniff");

// --- a web page disguised as a file must not run on this site
res = await upload(asha, toBala, Buffer.from("<script>alert(1)</script>"), "x.html", "text/html");
const page = thread(await res.json(), toBala).at(-1);
res = await bala.call(`/api/files?id=${page.file.id}`);
check("an HTML file is served as a plain download", res.headers.get("content-type") === "application/octet-stream" && /^attachment/.test(res.headers.get("content-disposition") ?? ""));
res = await upload(asha, toBala, Buffer.from("<svg onload='alert(1)' xmlns='http://www.w3.org/2000/svg'/>"), "x.svg", "image/svg+xml");
const svg = thread(await res.json(), toBala).at(-1);
res = await bala.call(`/api/files?id=${svg.file.id}`);
check("an SVG is not treated as a safe picture", res.headers.get("content-type") === "application/octet-stream");

// --- limits
check("an empty file is refused", (await upload(asha, toBala, Buffer.alloc(0), "empty.txt", "text/plain")).status === 400);
check("a file over 8 MB is refused", (await upload(asha, toBala, Buffer.alloc(8 * 1024 * 1024 + 1), "big.bin", "application/octet-stream")).status === 400);
check("sending a file needs sign-in", (await upload(anon(B), toBala, png, "card.png", "image/png")).status === 401);
check("a file cannot be sent into someone else's chat", (await upload(chitra, toBala, png, "card.png", "image/png")).status === 400);
check("a made-up file id finds nothing", (await asha.call("/api/files?id=../../db.json")).status === 404);

// --- deleting takes the file away for both
await asha.call("/api/messages", "DELETE", { id: photo.id });
check("deleting the message removes the file for me", (await asha.call(`/api/files?id=${photo.file.id}`)).status === 404);
check("and for the other person", (await bala.call(`/api/files?id=${photo.file.id}`)).status === 404);
check("other files are untouched", (await bala.call(`/api/files?id=${doc.file.id}`)).status === 200);

// --- the export names the attachment
const txt = await (await asha.call(`/api/export?contactId=${toBala}`)).text();
check("the chat export names attached files", /<attached: trip plan\.txt> Here is the plan/.test(txt), txt.slice(0, 300));

// --- starring a person
a = await asha.json("/api/contacts", "POST", { contactId: toBala, starred: true });
check("a person can be starred", a.contacts.find((c) => c.id === toBala)?.starred === true);
b = await bala.json("/api/state");
check("a star on a person is private", !b.contacts.find((c) => c.id === toAsha)?.starred);
check("starring does not change who they are to me", a.contacts.find((c) => c.id === toBala)?.relationSource !== "user");
a = await asha.json("/api/contacts", "POST", { contactId: toBala, starred: false });
check("the star can be removed", !a.contacts.find((c) => c.id === toBala)?.starred);

finish();
