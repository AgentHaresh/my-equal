import { load, save, seed } from "@/lib/store";
import { snapshot, friendSnapshot, protectedSnapshot } from "@/lib/snapshot";


export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const friend = q.get("friend");
  const guarded = q.get("protected");
  if (guarded) return Response.json(protectedSnapshot(load(), guarded));
  return Response.json(friend ? friendSnapshot(load(), friend) : snapshot(load()));
}

// DELETE resets the demo to its sample data.
export async function DELETE() {
  const db = seed();
  save(db);
  return Response.json(snapshot(db));
}
