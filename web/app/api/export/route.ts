import { context, unauthorised } from "@/lib/auth";

// GET ?contactId=: one chat as a plain text file, in the same shape WhatsApp exports, so it can be
// read anywhere and brought back in. GET with no contactId: everything of mine, as one JSON file.
// Your chats are yours to take with you.
export async function GET(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const contactId = new URL(request.url).searchParams.get("contactId");
  const day = new Date().toISOString().slice(0, 10);
  const download = (name: string, type: string, body: string) =>
    new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
  const mine = db.contacts.filter((c) => !c.owner);

  if (contactId) {
    const contact = mine.find((c) => c.id === contactId);
    if (!contact) return Response.json({ error: "No such chat." }, { status: 404 });
    const stamp = (iso: string) =>
      new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
    const lines = db.messages
      .filter((m) => m.contactId === contact.id && m.from !== "butler") // Equal's private notes are not part of the conversation
      .map((m) => `[${stamp(m.at)}] ${m.from === "me" ? user.name : contact.name}: ${m.deleted ? "<This message was deleted>" : m.enc ? "<private message, readable only on your phone>" : [m.file ? `<attached: ${m.file.name}>` : "", m.text.replace(/\r?\n/g, " ")].filter(Boolean).join(" ")}`);
    const safe = contact.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "chat";
    return download(`My Equal chat with ${safe} ${day}.txt`, "text/plain", lines.join("\n") + "\n");
  }

  const ids = new Set(mine.map((c) => c.id));
  const all = {
    exported_at: new Date().toISOString(),
    owner: { name: user.name },
    contacts: mine.map((c) => ({ id: c.id, name: c.name, relation: c.relation, last_contact: c.lastContactAt })),
    messages: db.messages.filter((m) => ids.has(m.contactId)).map((m) => ({ chat: m.contactId, from: m.from === "butler" ? "equal_note" : m.from, text: m.enc ? "" : m.text, private: Boolean(m.enc), at: m.at, edited: Boolean(m.editedAt), deleted: Boolean(m.deleted), starred: Boolean(m.starred) })),
    memories: db.memories.filter((m) => ids.has(m.contactId)).map((m) => ({ chat: m.contactId, fact: m.fact, kind: m.kind, when: m.when, status: m.status })),
  };
  return download(`My Equal export ${day}.json`, "application/json", JSON.stringify(all, null, 2));
}
