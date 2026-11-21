import { removeSamples, resetSamples, save } from "@/lib/store";
import { context, unauthorised } from "@/lib/auth";
import { snapshot } from "@/lib/snapshot";

// Real accounts start empty. The demo chats (made-up people, clearly labelled) are added only
// when the person asks, so they can try every feature, and are removed again the same way.
// POST {on: true} adds or resets them; POST {on: false} removes them. Real chats are never touched.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const body = await request.json().catch(() => null);
  if (body?.on === true) {
    resetSamples(ctx.db);
    ctx.db.demo = true;
  } else if (body?.on === false) {
    removeSamples(ctx.db);
    ctx.db.demo = false;
  } else return Response.json({ error: "Say whether the demo should be on." }, { status: 400 });
  save();
  return Response.json(snapshot(ctx.db, ctx.user));
}
