/**
 * Voice for calls: speech in (transcription) and speech out (text to speech).
 * Both go through OpenAI. Model names can be overridden in the environment;
 * otherwise the first one the account accepts is remembered and reused.
 */

const KEY = () => process.env.OPENAI_API_KEY ?? "";

const STT_MODELS = [process.env.OPENAI_STT_MODEL, "gpt-transcribe", "gpt-4o-mini-transcribe", "whisper-1"].filter(Boolean) as string[];
const TTS_MODELS = [process.env.OPENAI_TTS_MODEL, "gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15", "tts-1"].filter(Boolean) as string[];
const VOICE = process.env.OPENAI_TTS_VOICE ?? "alloy";

let stt: string | null = null;
let tts: string | null = null;

/** Try each candidate model until one is accepted; a model-name error moves on to the next. */
async function firstAccepted(models: string[], known: string | null, run: (model: string) => Promise<Response>) {
  let last = "";
  for (const model of known ? [known] : models) {
    const res = await run(model);
    if (res.ok) return { res, model };
    last = `${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (!/model/i.test(last)) break; // not a model-name problem, so retrying another model will not help
  }
  throw new Error(`OpenAI voice ${last}`);
}

/** Turn recorded speech into text. Handles English, Hindi, Telugu and mixtures. */
export async function transcribe(audio: Blob, filename: string): Promise<string> {
  const { res, model } = await firstAccepted(STT_MODELS, stt, (m) => {
    const form = new FormData();
    form.append("file", audio, filename);
    form.append("model", m);
    form.append("prompt", "A shopkeeper or mechanic in India answering a phone enquiry. May mix English, Hindi and Telugu. Shop names, prices in rupees, times.");
    return fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${KEY()}` }, body: form });
  });
  stt = model;
  const data = await res.json();
  return String(data.text ?? "").trim();
}

const spoken = new Map<string, ArrayBuffer>(); // small cache: the same line is often requested twice

/** Turn a line of text into speech (MP3). */
export async function speak(text: string): Promise<ArrayBuffer> {
  const hit = spoken.get(text);
  if (hit) return hit;
  const { res, model } = await firstAccepted(TTS_MODELS, tts, (m) =>
    fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: m, voice: VOICE, input: text, response_format: "mp3" }),
    })
  );
  tts = model;
  const buf = await res.arrayBuffer();
  if (spoken.size > 200) spoken.clear();
  spoken.set(text, buf);
  return buf;
}

export function voiceModels() {
  return { stt, tts, voice: VOICE };
}
