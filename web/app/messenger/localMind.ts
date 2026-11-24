// Equal on this device: reads end-to-end encrypted chats with a language model running on the phone,
// and keeps what it learns here. Nothing it reads or concludes is sent to the server or to any cloud model.
//
//  - The model runs in a Web Worker on the GPU (WebGPU), through WebLLM. Its weights are downloaded once
//    and kept in this site's private file storage (OPFS).
//  - Each private message is read once, in order, with the few messages before it and the facts already
//    known about that person (lib/local-reader.ts). The answer is checked by code before anything is kept.
//  - What it learns (facts, promises, tone, plans now done) lives in this browser's IndexedDB, per account.
//    Every fact keeps the id of the message it came from: when that message is edited it is read again,
//    and when it is deleted its facts go.
//
// Not yet: this memory is not encrypted at rest beyond what the browser itself provides.
import type { MLCEngineInterface } from "@mlc-ai/web-llm";
import { readLocally, type ChatLine, type Generate } from "@/lib/local-reader";
import { parseWhen } from "@/lib/nudges";
import type { Memory } from "@/lib/store";

/** The model Equal runs on this device. Chosen by the benchmark in eval/local-cases.json. */
export const LOCAL_MODEL = "Qwen2.5-3B-Instruct-q4f16_1-MLC";
/** Shown before the download, so nobody is surprised by it. From WebLLM's model list (VRAM needed). */
export const LOCAL_MODEL_SIZE = "about 2.5 GB";

export type LocalFact = Memory & { local: true };
export type Mind = {
  facts: LocalFact[];
  tones: Record<string, { mood: string; note: string }>; // by message id
  read: Record<string, string>; // message id -> the nonce of the version that was read
};

const empty = (): Mind => ({ facts: [], tones: {}, read: {} });

// ---------- storage: one record per account in IndexedDB

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("my-equal-mind", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("mind");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadMind(userId: string): Promise<Mind> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("mind").objectStore("mind").get(userId);
    req.onsuccess = () => resolve({ ...empty(), ...((req.result as Mind | undefined) ?? {}) });
    req.onerror = () => reject(req.error);
  });
}

export async function saveMind(userId: string, mind: Mind): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("mind", "readwrite");
    tx.objectStore("mind").put(mind, userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- the model

/** Can this browser run the model at all? */
export async function canRunLocally(): Promise<{ ok: boolean; why?: string }> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { ok: false, why: "This browser has no WebGPU, which the on-device model needs." };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { ok: false, why: "No graphics adapter is available to run the model." };
  if (!adapter.features.has("shader-f16")) return { ok: false, why: "This device's graphics cannot run the model's 16-bit maths." };
  return { ok: true };
}

let engine: Promise<MLCEngineInterface> | null = null;

/** Start the model, downloading it the first time. Progress is reported as text and a 0..1 fraction. */
export function startModel(onProgress: (text: string, fraction: number) => void): Promise<MLCEngineInterface> {
  if (!engine) {
    engine = (async () => {
      const webllm = await import("@mlc-ai/web-llm");
      const worker = new Worker(new URL("./llm.worker.ts", import.meta.url), { type: "module" });
      return webllm.CreateWebWorkerMLCEngine(worker, LOCAL_MODEL, {
        appConfig: { ...webllm.prebuiltAppConfig, cacheBackend: "opfs" },
        initProgressCallback: (p) => onProgress(p.text, p.progress),
      });
    })();
    engine.catch(() => {
      engine = null; // a failed start can be tried again
    });
  }
  return engine;
}

/** Remove the downloaded model from this device. */
export async function forgetModel(): Promise<void> {
  if (engine) {
    try {
      await (await engine).unload();
    } catch {
      /* already gone */
    }
    engine = null;
  }
  const webllm = await import("@mlc-ai/web-llm");
  await webllm.deleteModelAllInfoInCache(LOCAL_MODEL, { ...webllm.prebuiltAppConfig, cacheBackend: "opfs" });
}

// ---------- reading

type Msg = { id: string; contactId: string; from: "me" | "them" | "butler"; text: string; at: string; deleted?: boolean; enc?: { iv: string } };
type Who = { id: string; name: string; relation: string };

const newId = () => `L${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * The private messages that still need reading, oldest first: ones never read, and ones edited since
 * (their nonce changed). Messages this device could not unlock are skipped.
 */
export function toRead(mind: Mind, messages: Msg[], unreadable: (text: string) => boolean): Msg[] {
  return messages.filter((m) => m.enc && !m.deleted && m.from !== "butler" && !unreadable(m.text) && mind.read[m.id] !== m.enc.iv).sort((a, b) => a.at.localeCompare(b.at));
}

/** Facts from deleted messages go. Returns true if anything changed. */
export function dropDeleted(mind: Mind, messages: Msg[]): boolean {
  const gone = new Set(messages.filter((m) => m.deleted).map((m) => m.id));
  const before = mind.facts.length;
  mind.facts = mind.facts.filter((f) => !f.sourceMessageId || !gone.has(f.sourceMessageId));
  for (const id of gone) delete mind.tones[id];
  return mind.facts.length !== before;
}

/** Read one private message on this device and keep what it says. */
export async function readOne(mind: Mind, model: MLCEngineInterface, msg: Msg, who: Who, thread: Msg[]): Promise<void> {
  // Runs the model once. A request can fail; try once more after a reset. If it fails again the model
  // itself is broken (most often the GPU was reset by the operating system), so stop: the message stays
  // unread and the model is started afresh next time, instead of every later message being skipped.
  const generate: Generate = async (system, user, schema) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const out = await model.chat.completions.create({
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0,
          max_tokens: 120,
          response_format: { type: "json_object", schema: JSON.stringify(schema) },
          // Qwen3 models think aloud before answering unless told not to; that costs seconds and adds nothing here.
          ...(/qwen3/i.test(LOCAL_MODEL) ? { extra_body: { enable_thinking: false } } : {}),
        });
        return out.choices[0]?.message?.content ?? "";
      } catch (e) {
        if (attempt >= 1) {
          engine = null;
          throw new Error(`Equal on this device stopped (${e instanceof Error ? e.message.slice(0, 80) : "model error"}). Turn it off and on to try again.`);
        }
        await model.resetChat().catch(() => {});
      }
    }
  };
  const line = (m: Msg): ChatLine => ({ from: m.from === "me" ? "me" : "them", text: m.text, at: m.at });
  // An edited message is read afresh: what was learned from its old words goes once the new reading is in.
  const others = mind.facts.filter((f) => f.sourceMessageId !== msg.id);
  const known = others.filter((f) => f.contactId === who.id && f.status === "open").map((f) => ({ id: f.id, fact: f.fact, when: f.when }));
  const a = await readLocally(generate, who, thread.map(line), line(msg), known);
  mind.facts = others;
  delete mind.tones[msg.id];
  const now = new Date().toISOString();
  for (const m of a.memories) {
    const parsed = m.when ? parseWhen(m.when) : null;
    mind.facts.push({ id: newId(), contactId: who.id, fact: m.fact, kind: m.kind, about: m.about, when: parsed?.iso ?? null, timed: parsed?.timed || undefined, status: "open", createdAt: now, sourceMessageId: msg.id, local: true });
  }
  for (const id of a.resolved) {
    const f = mind.facts.find((x) => x.id === id);
    if (f) f.status = "done";
  }
  if (a.tone) mind.tones[msg.id] = a.tone;
  if (msg.enc) mind.read[msg.id] = msg.enc.iv;
}
