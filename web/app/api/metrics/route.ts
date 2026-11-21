import { root } from "@/lib/store";
import { activeModel } from "@/lib/butler";
import { liveCount } from "@/lib/live";
import { report } from "@/lib/metrics";
import { context, unauthorised } from "@/lib/auth";

// GET: measurements of the running app, for the status page and for whoever operates it.
// Totals only: how many, how fast, how much. No names, numbers or message text.
// Needs a signed-in person, or the operator's token (METRICS_TOKEN) for a scraper.
export async function GET(request: Request) {
  const token = process.env.METRICS_TOKEN;
  const bearer = request.headers.get("authorization") === `Bearer ${token}`;
  if (!(token && bearer) && !context(request)) return unauthorised();

  const r = root();
  const spaces = Object.values(r.spaces);
  const m = report();
  const calls = m.counters["model.calls"] ?? 0;
  return Response.json(
    {
      ...m,
      model: activeModel(),
      openConnections: liveCount(),
      totals: {
        accounts: r.users.filter((u) => !u.test).length,
        testAccounts: r.users.filter((u) => u.test).length,
        messages: spaces.reduce((n, s) => n + s.messages.length, 0),
        memories: spaces.reduce((n, s) => n + s.memories.length, 0),
      },
      // The context the model is given stays small however long a chat gets. These are measured, not designed-in, numbers.
      context: {
        promptTokensPerMessageRead: m.timings["model.prompt_tokens.read_message"] ?? null,
        promptTokensPerQuestion: m.timings["model.prompt_tokens.answer_question"] ?? null,
        averagePromptTokens: calls ? Math.round((m.counters["model.tokens.prompt"] ?? 0) / calls) : null,
        cachedPromptShare: m.counters["model.tokens.prompt"] ? Number(((m.counters["model.tokens.cached"] ?? 0) / m.counters["model.tokens.prompt"]).toFixed(3)) : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
