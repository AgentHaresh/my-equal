import { context, unauthorised } from "@/lib/auth";
import { listen } from "@/lib/live";

// GET: a connection the app keeps open. The server writes one short line down it whenever
// anything changes, and the app then asks for its own news. No chat content travels here.
export async function GET(request: Request) {
  const ctx = context(request);
  if (!ctx) return unauthorised();
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let pending: ReturnType<typeof setTimeout> | null = null;
      const send = (line: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          stop();
        }
      };
      // Several saves in a row become one nudge.
      const unlisten = listen(() => {
        if (pending) return;
        pending = setTimeout(() => {
          pending = null;
          send("data: changed\n\n");
        }, 40);
      });
      const beat = setInterval(() => send(": still here\n\n"), 20000); // keeps the connection from being dropped as idle
      stop = () => {
        if (closed) return;
        closed = true;
        unlisten();
        clearInterval(beat);
        if (pending) clearTimeout(pending);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", stop);
      send("retry: 3000\n\n");
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
