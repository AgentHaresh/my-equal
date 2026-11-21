import { save, uid, Message } from "@/lib/store";
import { analyse } from "@/lib/butler";
import { guessMe, parseWhatsApp, sendersOf } from "@/lib/whatsapp";
import { learnRelation } from "@/lib/people";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { allow, tooMany } from "@/lib/ratelimit";

const KEEP = 500; // the most recent messages kept from one export
const READ = 25; // how many of the newest are read for things to remember

// Import a WhatsApp "Export chat" text file as a conversation, into the signed-in person's space.
// The person does not type their name: it is worked out from the file, and if that is not clear
// the answer lists who speaks in it, so the app can ask "which one is you?".
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const limit = allow("import", user.id, 20, 3600);
  if (!limit.ok) return tooMany(limit, "Too many imports");
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  if (!text) return Response.json({ error: "Choose the exported chat file." }, { status: 400 });
  if (text.length > 6_000_000) return Response.json({ error: "That export is too large. Export without media and try again." }, { status: 400 });

  const parsed = parseWhatsApp(text);
  if (!parsed.length) return Response.json({ error: "No messages were recognised in that file. Choose the .txt (or .zip) that WhatsApp's \"Export chat\" made." }, { status: 400 });
  const senders = sendersOf(parsed);

  // Who is "me" in this file? Said outright, or worked out from the account's name.
  const said = String(body?.me ?? body?.myName ?? "").trim();
  let me: string | null = null;
  if (said) {
    me = senders.find((s) => s.toLowerCase() === said.toLowerCase()) ?? guessMe(senders, said);
    if (!me) return Response.json({ error: `Nobody called "${said}" speaks in that chat. The people in it are: ${senders.slice(0, 6).join(", ")}.`, senders: senders.slice(0, 12) }, { status: 400 });
  } else {
    me = guessMe(senders, user.name);
    if (!me) return Response.json({ choose: senders.slice(0, 12), count: parsed.length });
  }

  const others = senders.filter((s) => s !== me);
  if (!others.length) return Response.json({ error: "Only your own messages are in that file, so there is no one to file it under." }, { status: 400 });
  const group = others.length > 1;
  const title = group ? `Group: ${others.slice(0, 3).join(", ")}${others.length > 3 ? ` +${others.length - 3}` : ""}` : others[0];

  let contact = db.contacts.find((c) => !c.sample && !c.userId && !c.owner && c.name.toLowerCase() === title.toLowerCase());
  if (!contact) {
    contact = { id: uid(), name: title, relation: group ? "group, imported from WhatsApp" : "imported from WhatsApp", close: false, lastContactAt: parsed[parsed.length - 1].at };
    db.contacts.unshift(contact);
  }
  // Importing the same file twice must not double the chat.
  const have = new Set(db.messages.filter((m) => m.contactId === contact.id).map((m) => `${m.at}|${m.from}|${m.text}`));
  const added: Message[] = [];
  for (const m of parsed.slice(-KEEP)) {
    const from = m.sender === me ? "me" : "them";
    const words = (group && from === "them" ? `${m.sender}: ${m.text}` : m.text).slice(0, 2000);
    const key = `${m.at}|${from}|${words}`;
    if (have.has(key)) continue;
    have.add(key);
    added.push({ id: uid(), contactId: contact.id, from, text: words, at: m.at });
  }
  if (!added.length) return Response.json({ ...snapshot(db, user), imported: 0, already: true, contactId: contact.id, title });
  db.messages.push(...added);
  // Older history brought into a chat that already has messages must land in time order. Only
  // this chat's messages are reordered; they keep the places this chat already held in the list.
  const mine = db.messages.filter((m) => m.contactId === contact.id).sort((a, b) => a.at.localeCompare(b.at));
  let next = 0;
  db.messages = db.messages.map((m) => (m.contactId === contact.id ? mine[next++] : m));
  contact.lastContactAt = added[added.length - 1].at;
  save();

  // Read the most recent messages for memories. Old messages never trigger an offer of help.
  let error: string | null = null;
  for (const m of added.slice(-READ)) {
    error = await analyse(db, contact, m, true);
    if (error) break;
  }
  // Work out who this person is to the user, and so whether to watch for drifting apart.
  if (!error && !group) error = await learnRelation(db, contact);
  save();
  return Response.json({ ...snapshot(db, user, error), imported: added.length, contactId: contact.id, title, importedAs: me });
}
