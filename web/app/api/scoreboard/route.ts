import { lastResults, runScoreboard } from "@/lib/evaluate";

// GET: the most recent recorded results. Reading them costs nothing.
export async function GET() {
  return Response.json(lastResults() ?? { error: "The scoreboard has not been run yet." });
}

// POST: run every test message again. Guarded by the server's test secret, because each run
// makes about sixty model calls.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!process.env.TEST_LOGIN_SECRET || body?.secret !== process.env.TEST_LOGIN_SECRET) return Response.json({ error: "not allowed" }, { status: 403 });
  const results = await runScoreboard(String(body?.note ?? "").slice(0, 300));
  return Response.json(results);
}
