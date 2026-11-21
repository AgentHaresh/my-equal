import { lastMemoryResults, runMemoryBenchmark } from "@/lib/memory-eval";

// GET: the most recent recorded results of the memory benchmark. Reading them costs nothing.
export async function GET() {
  return Response.json(lastMemoryResults() ?? { error: "The memory benchmark has not been run yet." });
}

// POST: run it again. Guarded by the server's test secret, because a run makes about seventy model calls.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!process.env.TEST_LOGIN_SECRET || body?.secret !== process.env.TEST_LOGIN_SECRET) return Response.json({ error: "not allowed" }, { status: 403 });
  try {
    return Response.json(await runMemoryBenchmark(String(body?.note ?? "").slice(0, 300)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
