import { save } from "@/lib/store";
import { book } from "@/lib/calls";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user approves one provider. Nothing is booked without this request.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const body = await request.json().catch(() => null);
  const job = db.jobs.find((j) => j.id === body?.jobId);
  if (!job) return Response.json({ error: "job not found" }, { status: 404 });
  if (!book(db, job, String(body?.callId ?? ""))) return Response.json({ error: "cannot book that provider" }, { status: 400 });
  save();
  return Response.json(snapshot(db, user));
}

// The user removes a call-around: it disappears, and its provider links stop working. Nothing is booked.
export async function DELETE(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const body = await request.json().catch(() => null);
  const i = db.jobs.findIndex((j) => j.id === body?.jobId);
  if (i < 0) return Response.json({ error: "job not found" }, { status: 404 });
  const [job] = db.jobs.splice(i, 1);
  const offer = db.suggestions.find((s) => s.id === job.suggestionId);
  if (offer) offer.status = "dismissed";
  save();
  return Response.json(snapshot(db, user));
}
