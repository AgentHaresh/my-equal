import { askEqual } from "@/lib/ask";
import { context, unauthorised } from "@/lib/auth";
import { allow, tooMany } from "@/lib/ratelimit";

// "Ask my Equal": a question answered from the signed-in person's own memories and messages.
export async function POST(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const limit = allow("ask", ctx.user.id, 40, 600);
  if (!limit.ok) return tooMany(limit, "Too many questions");
  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 300) : "";
  if (!question) return Response.json({ error: "Ask a question." }, { status: 400 });
  return Response.json(await askEqual(ctx.db, question));
}
