import { root } from "@/lib/store";
import { butlerStatus } from "@/lib/butler";
import { liveCount } from "@/lib/live";
import { storageInfo } from "@/lib/storage";
import { onScreenFallback, smsProvider } from "@/lib/otp";

const startedAt = Date.now();

// GET: is the app up, and can it do its job? Cheap, needs no sign-in, and tells nothing about
// anyone: a load balancer or uptime monitor can call it every few seconds.
// 200 when healthy; 503 when the data cannot be read or the assistant has no model to talk to.
export async function GET(request: Request) {
  void request.headers; // answered fresh on every call, never from a build-time copy
  let storeOk = true;
  try {
    root();
  } catch {
    storeOk = false;
  }
  const assistant = butlerStatus();
  const healthy = storeOk && assistant === "online";
  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks: { store: storeOk ? "ok" : "unreadable", assistant: assistant === "online" ? "ok" : "offline" },
      storage: storageInfo(), // which engine, and whether the disk copy is encrypted
      signIn: { sms: smsProvider() ? "connected" : "none", codeShownOnScreen: onScreenFallback() }, // the second must be false for real use
      openConnections: liveCount(),
      version: process.env.APP_VERSION ?? "dev",
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
