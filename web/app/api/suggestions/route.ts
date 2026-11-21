import { save } from "@/lib/store";
import { createJob } from "@/lib/calls";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// The user answers a suggestion from Equal: accept or dismiss. Nothing happens without this.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const { db, user } = ctx;
  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = body?.action === "accept" ? "accept" : "dismiss";
  const stored = db.suggestions.find((s) => s.id === id);
  if (stored) {
    const first = stored.status === "new";
    stored.status = action === "accept" ? "accepted" : "dismissed";
    // Saying yes to an offer of help starts the call-around.
    if (first && action === "accept" && stored.type === "intent") await createJob(db, stored);
  }
  if (!stored && id.startsWith("rm-") && action === "accept") {
    // "Done" on a reminder: the commitment is finished.
    const memory = db.memories.find((m) => m.id === id.slice(3));
    if (memory) memory.status = "done";
  } else if (!stored && id && !db.dismissed.includes(id)) db.dismissed.push(id); // computed nudges are simply hidden once answered
  save();
  return Response.json(snapshot(db, user));
}
