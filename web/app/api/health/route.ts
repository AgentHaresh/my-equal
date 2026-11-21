// Development-only check: which model is configured, and which model ids this key can use.
// Returns ids only. Disabled in production builds.
export async function GET() {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not available" }, { status: 404 });
  const configured = process.env.OPENAI_MODEL ?? null;
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
  if (!res.ok) return Response.json({ configured, base, error: `${res.status}: ${(await res.text()).slice(0, 200)}` });
  const data = await res.json();
  const ids: string[] = (data.data ?? [])
    .sort((a: { created?: number }, b: { created?: number }) => (b.created ?? 0) - (a.created ?? 0))
    .map((m: { id: string }) => m.id);
  return Response.json({ configured, base, valid: configured ? ids.includes(configured) : false, total: ids.length, ids });
}
