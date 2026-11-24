// Benchmark the on-device reader (lib/local-reader.ts, readLocally) with real models in Chromium + WebGPU.
// Usage (from web/): CHROME_PATH=<chromium or chrome> node eval/local-bench.mjs <webllm-model-id> [...]
// Needs a GPU with WebGPU. Weights are downloaded once into eval/.llm-profile (ignored by git).
// Replays each chat in eval/memory-cases.json and eval/local-cases.json one message at a time, as the
// app would, scores recall, dates, noise, tone and finished plans, and writes eval/local-results.json.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(HERE, "..");
const { readLocally } = await import(pathToFileURL(`${WEB}/lib/local-reader.ts`).href);
const CONCERN = new Set(["sad", "stressed", "upset", "angry", "worried", "unwell", "lonely", "tired", "hurt"]);
const mem = JSON.parse(fs.readFileSync(`${WEB}/eval/memory-cases.json`, "utf8")).cases.filter((c) => !c.tell);
const loc = JSON.parse(fs.readFileSync(`${WEB}/eval/local-cases.json`, "utf8")).cases;
const cases = [...mem, ...loc];

const bundle = fs.readFileSync(`${WEB}/node_modules/@mlc-ai/web-llm/lib/index.js`);
const server = http.createServer((req, res) => (req.url === "/web-llm.js" ? res.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle) : res.writeHead(200, { "Content-Type": "text/html" }).end("<!doctype html>")));
await new Promise((r) => server.listen(5179, r));
const ctx = await chromium.launchPersistentContext(path.join(HERE, ".llm-profile"), { executablePath: process.env.CHROME_PATH, headless: true, args: ["--enable-unsafe-webgpu"] });
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(0);
page.on("console", (m) => /DEVICE_HUNG|Device was lost/.test(m.text()) && console.log("   [gpu]", m.text().slice(0, 120)));
await page.goto("http://localhost:5179/");
await page.evaluate(async () => {
  window.webllm = await import("/web-llm.js");
});

const now = Date.now();
const IST = 5.5 * 3600000;
const dayOf = (o) => new Date(now + IST + o * 86400000).toISOString().slice(0, 10);
const at = (day, time) => new Date(`${dayOf(day)}T${time}:00+05:30`).toISOString();
const re = (list, text) => list.some((p) => new RegExp(p, "i").test(text));
const all = fs.existsSync(path.join(HERE, "local-results.json")) ? JSON.parse(fs.readFileSync(path.join(HERE, "local-results.json"), "utf8")) : {};

for (const model of process.argv.slice(2)) {
  const t0 = Date.now();
  await page.evaluate(async (id) => {
    if (window.engine) await window.engine.unload();
    window.engine = await window.webllm.CreateMLCEngine(id, { appConfig: { ...window.webllm.prebuiltAppConfig, cacheBackend: "opfs" } });
  }, model);
  const loadSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  console.log(`${model}: loaded in ${loadSeconds} s`);
  const think = /qwen3/i.test(model);
  const calls = [];
  let dead = false;
  const generate = async (system, user, schema) => {
    if (dead) throw new Error("model is dead");
    const r = await page.evaluate(
      async ({ system, user, schema, think }) => {
        const t = performance.now();
        for (let attempt = 0; ; attempt++) {
          try {
            const out = await window.engine.chat.completions.create({ messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0, max_tokens: 120, response_format: { type: "json_object", schema }, ...(think ? { extra_body: { enable_thinking: false } } : {}) });
            return { text: out.choices[0].message.content, ms: performance.now() - t, prompt: out.usage?.prompt_tokens, out: out.usage?.completion_tokens, retried: attempt };
          } catch (e) {
            if (attempt >= 1) return { error: String(e).slice(0, 120), ms: performance.now() - t };
            try {
              await window.engine.resetChat();
            } catch {
              return { error: "reset failed: " + String(e).slice(0, 100), ms: performance.now() - t };
            }
          }
        }
      },
      { system, user, schema: JSON.stringify(schema), think },
    );
    calls.push(r);
    if (r.error) {
      dead = true;
      throw new Error(r.error);
    }
    return r.text;
  };

  const checks = [];
  const add = (kind, caseId, what, ok, detail) => checks.push({ kind, caseId, what, ok, detail });
  let messages = 0;
  const perMessage = [];
  for (const c of cases) {
    if (dead) break;
    const known = (c.known ?? []).map((k) => ({ id: k.id, fact: k.fact, when: k.when === null || k.when === undefined ? null : dayOf(k.when) }));
    const kept = [];
    const resolved = new Set();
    const tones = [];
    const thread = [];
    for (const line of c.messages) {
      const newest = { from: line.from, text: line.text, at: at(line.day, line.time) };
      const t = Date.now();
      let a;
      try {
        a = await readLocally(generate, c.contact, thread, newest, known.filter((k) => !resolved.has(k.id)));
      } catch (e) {
        console.log(`   model failed on ${c.id}: ${e.message}`);
        break;
      }
      perMessage.push(Date.now() - t);
      messages++;
      for (const m of a.memories) {
        known.push({ id: `m${known.length + 1}`, fact: m.fact, when: m.when });
        kept.push(m);
      }
      for (const id of a.resolved) resolved.add(id);
      tones.push(a.tone);
      thread.push(newest);
    }
    const list = kept.map((m) => `${m.about}/${m.kind}: ${m.fact} @${m.when}`).join(" | ") || "(none)";
    for (const f of c.facts ?? []) {
      const found = kept.filter((m) => re(f.any, m.fact) && (!f.about || m.about === f.about));
      add("recall", c.id, f.label, found.length > 0, list);
      if (found.length && f.kind) add("kind", c.id, `${f.label} is a ${f.kind}`, found.some((m) => m.kind === f.kind), list);
      if (found.length && f.day !== undefined) add("date", c.id, `${f.label} on day ${f.day}`, found.some((m) => (m.when ?? "").slice(0, 10) === dayOf(f.day)), list);
      if (found.length && f.time) add("date", c.id, `${f.label} at ${f.time}`, found.some((m) => (m.when ?? "").slice(11, 16) === f.time), list);
    }
    for (const n of c.noise ?? []) add("noise", c.id, `"${n}" not kept`, !kept.some((m) => re([n], m.fact)), list);
    if (c.maxFacts !== undefined) add("noise", c.id, `at most ${c.maxFacts} facts`, kept.length <= c.maxFacts, list);
    if (c.maxMatching) add("noise", c.id, `kept at most ${c.maxMatching.count} times`, kept.filter((m) => re(c.maxMatching.any, m.fact)).length <= c.maxMatching.count, list);
    if (Array.isArray(c.resolved)) add("resolved", c.id, "known plan marked done", c.resolved.every((id) => resolved.has(id)), [...resolved].join(",") || "none");
    else if (c.resolved) add("resolved", c.id, "plan then done is closed", kept.filter((m) => re(c.resolved.any, m.fact) && m.when).every((m) => resolved.has(`m${kept.indexOf(m) + 1}`)), `${list} | resolved: ${[...resolved].join(",") || "none"}`);
    if (c.tone) {
      const tn = tones[c.tone.on];
      add("tone", c.id, `tone is ${c.tone.expect}`, c.tone.expect === "concern" ? Boolean(tn && CONCERN.has(tn.mood)) : !tn || !CONCERN.has(tn.mood), tn ? tn.mood : "neutral");
    }
  }
  const tally = (k) => `${checks.filter((x) => x.kind === k && x.ok).length}/${checks.filter((x) => x.kind === k).length}`;
  const ok = calls.filter((c) => !c.error);
  const sorted = [...perMessage].sort((a, b) => a - b);
  const summary = {
    model,
    loadSeconds,
    messagesRead: messages,
    modelCalls: calls.length,
    retries: ok.filter((c) => c.retried).length,
    failures: calls.filter((c) => c.error).length,
    recall: tally("recall"),
    kind: tally("kind"),
    date: tally("date"),
    noise: tally("noise"),
    tone: tally("tone"),
    resolved: tally("resolved"),
    medianSecondsPerMessage: +((sorted[Math.floor(sorted.length / 2)] ?? 0) / 1000).toFixed(1),
    slowestSecondsPerMessage: +((sorted.at(-1) ?? 0) / 1000).toFixed(1),
    maxPromptTokens: Math.max(0, ...ok.map((c) => c.prompt ?? 0)),
    avgPromptTokens: Math.round(ok.reduce((s, c) => s + (c.prompt ?? 0), 0) / (ok.length || 1)),
  };
  console.log(JSON.stringify(summary));
  for (const x of checks.filter((x) => !x.ok)) console.log(`   miss [${x.kind}] ${x.caseId}: ${x.what} -> ${x.detail.slice(0, 170)}`);
  all[model] = { summary, checks, ranAt: new Date().toISOString() };
  fs.writeFileSync(path.join(HERE, "local-results.json"), JSON.stringify(all, null, 2));
  if (dead) {
    await page.reload();
    await page.evaluate(async () => {
      window.webllm = await import("/web-llm.js");
      window.engine = null;
    });
  }
}
await ctx.close();
server.close();
