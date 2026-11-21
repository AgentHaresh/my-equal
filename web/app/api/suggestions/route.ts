import { load, save } from "@/lib/store";
import { createJob } from "@/lib/calls";
import { snapshot } from "@/lib/snapshot";


// The user answers a butler suggestion: accept or dismiss. Nothing happens without this.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? "");
  const action = body?.action === "accept" ? "accept" : "dismiss";
  const db = load();
  const stored = db.suggestions.find((s) => s.id === id);
  if (stored) {
    const first = stored.status === "new";
    stored.status = action === "accept" ? "accepted" : "dismissed";
    // Saying yes to an offer of help starts the call-around.
    if (first && action === "accept" && stored.type === "intent") await createJob(db, stored);
  }
  if (!stored && id && !db.dismissed.includes(id)) db.dismissed.push(id); // computed nudges are simply hidden once answered
  save(db);
  return Response.json(snapshot(db));
}
