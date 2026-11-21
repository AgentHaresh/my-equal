import { deliver, describeVoice } from "@/lib/deliver";
import { transcribe } from "@/lib/voice";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// A voice note: the user speaks instead of typing. It is transcribed, translated to English for
// the reader when it is in another language, and then treated like any other message, so the
// assistant can remember it and offer help. The recording itself is not kept.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const contact = ctx.db.contacts.find((c) => c.id === form?.get("contactId"));
  if (!contact) return Response.json({ error: "No such chat." }, { status: 400 });
  if (!(audio instanceof Blob) || audio.size < 1200) return Response.json({ error: "That was too short to hear. Tap, speak, then tap again." }, { status: 400 });
  if (audio.size > 8_000_000) return Response.json({ error: "That recording is too long." }, { status: 400 });

  let text: string;
  try {
    text = await transcribe(audio, audio instanceof File && audio.name ? audio.name : "note.webm");
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  if (!text) return Response.json({ error: "I could not make that out. Please try again." }, { status: 400 });

  const voice = await describeVoice(text);
  const error = await deliver(ctx.db, ctx.user, contact, text.slice(0, 2000), voice);
  return Response.json({ ...snapshot(ctx.db, ctx.user, error), heard: text });
}
