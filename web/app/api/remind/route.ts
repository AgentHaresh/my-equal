import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";
import { notesContact } from "@/lib/photo";
import { markRang, reminderLine, setReminder } from "@/lib/remind";
import { speak } from "@/lib/voice";

// POST {action:"set", messageId? | text?, when?, callMe?}: set a reminder the user asked for.
//   With "when" that moment is used; without it, Equal reads the words to find the time.
// POST {action:"rang", id}: the reminder call was answered or dismissed.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const body = await request.json().catch(() => null);

  if (body?.action === "rang") {
    if (!markRang(db, String(body?.id ?? ""))) return Response.json({ error: "No such reminder." }, { status: 404 });
    return Response.json(snapshot(db, user));
  }
  if (body?.action !== "set") return Response.json({ error: "Unknown action." }, { status: 400 });

  const msg = typeof body?.messageId === "string" ? db.messages.find((m) => m.id === body.messageId && m.from !== "butler" && !m.deleted) : undefined;
  if (body?.messageId && !msg) return Response.json({ error: "No such message." }, { status: 404 });
  const text = msg ? msg.text : typeof body?.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return Response.json({ error: "Say what to remind you about." }, { status: 400 });
  // A reminder from a message belongs to that chat; a typed one lives in the user's own notes.
  const contact = msg ? db.contacts.find((c) => c.id === msg.contactId && !c.owner) : notesContact(db);
  if (!contact) return Response.json({ error: "No such chat." }, { status: 404 });

  const r = await setReminder(db, { text, contact, messageId: msg?.id, when: typeof body?.when === "string" ? body.when : undefined, callMe: body?.callMe !== false });
  if (!r.ok) return Response.json({ ...snapshot(db, user), reminderError: r.error });
  return Response.json({ ...snapshot(db, user), reminderSaid: r.said, reminderId: r.memory.id });
}

// GET ?id=: the audio of what Equal says on a reminder call. Only a real reminder of this user's
// can be spoken, so this cannot be used as a general text-to-speech service.
export async function GET(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const m = ctx.db.memories.find((x) => x.id === new URL(request.url).searchParams.get("id") && x.callMe);
  if (!m) return Response.json({ error: "No such reminder." }, { status: 404 });
  const line = reminderLine(ctx.user, m);
  try {
    const audio = await speak(line);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Line": encodeURIComponent(line) } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e), line }, { status: 502 });
  }
}
