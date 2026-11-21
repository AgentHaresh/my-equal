import { load, save, seed } from "@/lib/store";
import { snapshot, friendSnapshot } from "@/lib/snapshot";


export async function GET(request: Request) {
  const friend = new URL(request.url).searchParams.get("friend");
  return Response.json(friend ? friendSnapshot(load(), friend) : snapshot(load()));
}

// DELETE resets the demo to its sample data.
export async function DELETE() {
  const db = seed();
  save(db);
  return Response.json(snapshot(db));
}
