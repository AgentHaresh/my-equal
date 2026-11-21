import { execFile } from "child_process";
import { modelId } from "@/lib/butler";

// Development-only check of the keys in the environment (the production health check is /api/health). It reports whether each one is set and
// whether the service accepts it. It never returns a key's value. Disabled in production builds.

const set = (name: string) => Boolean(process.env[name]?.trim());

function awsIdentity(): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "python",
      ["-m", "awscli", "sts", "get-caller-identity", "--query", "Account", "--output", "text"],
      { env: process.env, timeout: 20000 },
      (err, stdout, stderr) => resolve(err ? `rejected: ${(stderr || err.message).trim().slice(0, 160)}` : `accepted, account ${stdout.trim()}`)
    );
  });
}

export async function GET() {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "not available" }, { status: 404 });

  const openai: Record<string, unknown> = {
    OPENAI_API_KEY: set("OPENAI_API_KEY") ? "set" : "missing",
    OPENAI_MODEL_as_written: process.env.OPENAI_MODEL ?? null,
    model_id_sent: modelId(),
  };
  if (set("OPENAI_API_KEY")) {
    const res = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });
    if (!res.ok) {
      openai.key = `rejected: ${res.status} ${(await res.text()).slice(0, 160)}`;
    } else {
      const ids: string[] = ((await res.json()).data ?? []).map((m: { id: string }) => m.id);
      openai.key = `accepted, ${ids.length} models available`;
      openai.model_valid = ids.includes(modelId());
      openai.voice_models = ids.filter((i) => /^gpt-(realtime|live)/.test(i));
    }
  }

  const awsNames = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"];
  const aws: Record<string, unknown> = Object.fromEntries(awsNames.map((n) => [n, set(n) ? "set" : "missing"]));
  aws.region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? null;
  // With keys in the environment this tests those; without them it tests the saved workshop login.
  aws.source = set("AWS_ACCESS_KEY_ID") ? "keys in the env file" : "saved login on this laptop";
  aws.check = await awsIdentity();

  return Response.json({ openai, aws });
}
