import { allow, clientAddress, tooMany } from "@/lib/ratelimit";
import { findUser, save, spaceOf } from "@/lib/store";
import { callerSays, findScreen, startScreen } from "@/lib/screen";
import { speak, transcribe } from "@/lib/voice";

// What the caller's page may see: the conversation and whether it has ended. Never the verdict or
// anything about the person being called.
function view(screen: { id: string; status: string; transcript: unknown[] }, error?: string | null, heard?: string) {
  return { id: screen.id, status: screen.status, transcript: screen.transcript, error: error ?? null, heard };
}

// GET ?id=..&n=..  the audio for one of Equal's lines in a screened call
// GET ?id=..       the current state of a screened call
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const found = findScreen(q.get("id") ?? "");
  if (!found) return Response.json({ error: "This call is not valid." }, { status: 404 });
  if (q.has("n")) {
    const line = found.screen.transcript[Number(q.get("n"))];
    if (!line || line.from !== "equal") return Response.json({ error: "no such line" }, { status: 404 });
    try {
      return new Response(await speak(line.text), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  return Response.json(view(found.screen));
}

// POST (JSON) {u, c}            an unknown number rings the protected person: start a screened call
// POST (JSON) {id, text}        the caller types something
// POST (form) id, audio         the caller says something
export async function POST(request: Request) {
  // Opened by link with no sign-in, and each use costs a model or speech call: limited per network address.
  const limit = allow("link.call", clientAddress(request), 3000, 600);
  if (!limit.ok) return tooMany(limit);
  const type = request.headers.get("content-type") ?? "";
  let id = "";
  let text = "";
  let heard: string | undefined;

  if (type.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const audio = form?.get("audio");
    id = String(form?.get("id") ?? "");
    if (!(audio instanceof Blob) || audio.size < 1200) return Response.json({ error: "That was too short to hear. Tap, speak, then tap again." }, { status: 400 });
    if (audio.size > 6_000_000) return Response.json({ error: "That recording is too long." }, { status: 400 });
    if (!findScreen(id)) return Response.json({ error: "This call is not valid." }, { status: 404 });
    try {
      text = await transcribe(audio, audio instanceof File && audio.name ? audio.name : "speech.webm");
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
    if (!text) return Response.json({ error: "I could not make that out. Please try again." }, { status: 400 });
    heard = text;
  } else {
    const body = await request.json().catch(() => null);
    if (body?.u && body?.c) {
      const owner = findUser(String(body.u));
      const space = owner && spaceOf(owner.id);
      const contact = space?.contacts.find((x) => x.id === body.c && x.owner && x.unknown);
      if (!space || !contact) return Response.json({ error: "This link is not valid." }, { status: 404 });
      const screen = startScreen(space, contact);
      save();
      return Response.json(view(screen));
    }
    id = String(body?.id ?? "");
    text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
  }

  const found = findScreen(id);
  if (!found || !text) return Response.json({ error: "id and something to say are required" }, { status: 400 });
  const error = await callerSays(found.db, found.contact, found.screen, text);
  save();
  return Response.json(view(found.screen, error, heard));
}
