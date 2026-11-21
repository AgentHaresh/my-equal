// Test of setting up and changing a profile: name, photo, and a line about you.
// Usage: node tests/profile-test.mjs <base-url>
import fs from "fs";
import { signIn, anon, checker } from "./helper.mjs";

const B = process.argv[2] ?? "http://localhost:3217";
const { check, finish } = checker();
const stamp = Date.now().toString(36);
const asha = await signIn(B, `profile-asha-${stamp}@example.com`, "Asha");
const bala = await signIn(B, `profile-bala-${stamp}@example.com`, "Bala");
const chitra = await signIn(B, `profile-chitra-${stamp}@example.com`, "Chitra");
const toBala = (await asha.json("/api/chats", "POST", { userId: bala.user.id })).contactId;
const png = fs.readFileSync(new URL("./fixtures/appointment.png", import.meta.url));

const setProfile = (who, fields, photo) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (photo) form.set("photo", new File([photo.bytes], photo.name ?? "photo.png", { type: photo.type ?? "image/png" }));
  return fetch(B + "/api/profile", { method: "POST", headers: who.cookie ? { cookie: who.cookie } : {}, body: form });
};

// --- name and about
let res = await setProfile(bala, { name: "  Bala   Krishna ", about: "Building things in Hyderabad" });
let b = await res.json();
check("a profile can be set, and the name is tidied", res.status === 200 && b.me.name === "Bala Krishna" && b.me.about === "Building things in Hyderabad");
check("once set, the app no longer asks for it", b.me.needsSetup === false);
let a = await asha.json("/api/state");
check("people I chat with see my new name", a.contacts.find((c) => c.id === toBala)?.name === "Bala Krishna");
check("the line about me is not pushed into other people's state", !JSON.stringify(a).includes("Building things"));

// --- rules
check("a profile needs a name", (await setProfile(bala, { name: "   " })).status === 400);
check("a very long name is refused", (await setProfile(bala, { name: "x".repeat(41) })).status === 400);
check("a very long line about me is refused", (await setProfile(bala, { name: "Bala", about: "x".repeat(141) })).status === 400);
check("setting a profile needs sign-in", (await setProfile(anon(B), { name: "Nobody" })).status === 401);

// --- photo
res = await setProfile(bala, { name: "Bala Krishna" }, { bytes: png });
b = await res.json();
check("a photo can be added", res.status === 200 && /^\/api\/avatar\?id=/.test(b.me.picture ?? ""), b.me.picture);
const photoUrl = b.me.picture;
res = await bala.call(photoUrl);
check("I can see my own photo", res.status === 200 && res.headers.get("content-type") === "image/png" && Buffer.from(await res.arrayBuffer()).equals(png));
a = await asha.json("/api/state");
check("someone I chat with gets my photo's address", a.contacts.find((c) => c.id === toBala)?.picture === photoUrl);
check("and can open it", (await asha.call(photoUrl)).status === 200);
check("someone I have no chat with cannot", (await chitra.call(photoUrl)).status === 404);
check("nor can someone who is not signed in", (await anon(B).call(photoUrl)).status === 401);
check("a made-up id finds nothing", (await asha.call("/api/avatar?id=../../equal.db")).status === 404);

res = await setProfile(bala, { name: "Bala Krishna" }, { bytes: Buffer.from("<script>alert(1)</script>"), name: "x.png", type: "image/png" });
check("a file that only claims to be a picture is refused", res.status === 400);
res = await setProfile(bala, { name: "Bala Krishna" }, { bytes: Buffer.concat([png, Buffer.alloc(700 * 1024)]) });
check("a photo that is too large is refused", res.status === 400);
check("a refused photo leaves the old one in place", (await bala.call(photoUrl)).status === 200);

res = await setProfile(bala, { name: "Bala Krishna", removePhoto: "yes" });
b = await res.json();
check("the photo can be removed", res.status === 200 && !b.me.picture && (await asha.call(photoUrl)).status === 404);
a = await asha.json("/api/state");
check("and it disappears for people I chat with", !a.contacts.find((c) => c.id === toBala)?.picture);

finish();
