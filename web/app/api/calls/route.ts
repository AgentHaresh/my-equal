import { save } from "@/lib/store";
import { findCall, openCall, providerSays } from "@/lib/calls";

// What the provider's call page is allowed to see: the conversation and the outcome, nothing about the user.
function view(job: { status: string; bookedCallId: string | null }, call: { id: string; status: string; transcript: unknown[] }, error?: string | null) {
  return {
    status: call.status,
    transcript: call.transcript,
    outcome: job.status === "booked" ? (job.bookedCallId === call.id ? "chosen" : "not_chosen") : "pending",
    error: error ?? null,
  };
}

// GET: the provider opens the call. Equal's fixed opening line is added on first open.
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const found = findCall(id);
  if (!found) return Response.json({ error: "This call link is not valid." }, { status: 404 });
  if (!found.call.transcript.length && found.job.status !== "booked") {
    openCall(found.job, found.call);
    save();
  }
  return Response.json(view(found.job, found.call));
}

// POST: the provider says something; Equal replies.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
  const found = findCall(String(body?.id ?? ""));
  if (!found || !text) return Response.json({ error: "id and text are required" }, { status: 400 });
  const error = await providerSays(found.db, found.job, found.call, text);
  save();
  return Response.json(view(found.job, found.call, error));
}
