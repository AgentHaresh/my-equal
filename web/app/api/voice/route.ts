import { allow, clientAddress, tooMany } from "@/lib/ratelimit";
import { save } from "@/lib/store";
import { findCall, providerSays } from "@/lib/calls";
import { speak, transcribe } from "@/lib/voice";

// GET: the audio for one line Equal said in a call. Only lines that exist in a real call can be
// spoken, so this cannot be used as a general text-to-speech service.
export async function GET(request: Request) {
  // Opened by link with no sign-in, and each use costs a model or speech call: limited per network address.
  const limit = allow("link.call", clientAddress(request), 3000, 600);
  if (!limit.ok) return tooMany(limit);
  const q = new URL(request.url).searchParams;
  const found = findCall(q.get("id") ?? "");
  const line = found?.call.transcript[Number(q.get("n"))];
  if (!line || line.from !== "butler") return Response.json({ error: "no such line" }, { status: 404 });
  try {
    const audio = await speak(line.text);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// POST: the provider spoke. Transcribe it, let Equal reply, and return the updated call.
export async function POST(request: Request) {
  // Opened by link with no sign-in, and each use costs a model or speech call: limited per network address.
  const limit = allow("link.call", clientAddress(request), 3000, 600);
  if (!limit.ok) return tooMany(limit);
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const found = findCall(String(form?.get("id") ?? ""));
  if (!found || !(audio instanceof Blob)) return Response.json({ error: "id and audio are required" }, { status: 400 });
  if (audio.size < 1200) return Response.json({ error: "That was too short to hear. Tap, speak, then tap again." }, { status: 400 });
  if (audio.size > 6_000_000) return Response.json({ error: "That recording is too long." }, { status: 400 });

  let heard: string;
  try {
    heard = await transcribe(audio, audio instanceof File && audio.name ? audio.name : "speech.webm");
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  if (!heard) return Response.json({ error: "I could not make that out. Please try again." }, { status: 400 });

  const error = await providerSays(found.db, found.job, found.call, heard);
  save();
  const { job, call } = found;
  return Response.json({
    status: call.status,
    transcript: call.transcript,
    outcome: job.status === "booked" ? (job.bookedCallId === call.id ? "chosen" : "not_chosen") : "pending",
    error,
    heard,
  });
}
