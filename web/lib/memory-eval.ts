import fs from "fs";
import path from "path";
import { DB, Contact, Memory, Message, emptySpace, todayIST, uid } from "./store";
import { activeModel, analyse } from "./butler";
import { askEqual } from "./ask";

/**
 * The memory benchmark: "how do you know the memory is right?"
 *
 * Scripted chats (eval/memory-cases.json) are read by the SAME code the app uses, on an empty
 * space, and then five things are measured:
 *
 *   recall      of the facts a person would expect to be kept, how many were
 *   dates       of the kept facts that had a date, how many got the right day
 *   noise       small talk that was wrongly kept as a fact
 *   answers     questions answerable from memory that were answered correctly
 *   honesty     questions with no answer in the chat that were declined, not guessed
 *
 * It is a small set written by the builder, in the style of LongMemEval. It measures this app's
 * own pipeline end to end, with the real model, and every miss is listed.
 */

const DIR = path.join(process.cwd(), "eval");
const CASES = path.join(DIR, "memory-cases.json");
const RESULTS = path.join(DIR, "memory-results.json");
const DAY = 86400000;

type Line = { from: "me" | "them"; day: number; time: string; text: string };
type Expect = { label: string; any: string[]; about?: "user" | "contact"; day?: number };
type Question = { q: string; any?: string[]; unknown?: boolean };
type Case = {
  id: string;
  contact: { name: string; relation: string };
  messages: Line[];
  tell?: string[];
  facts: Expect[];
  noise?: string[];
  maxFacts?: number;
  maxMatching?: { any: string[]; count: number };
  resolved?: { any: string[] };
  questions: Question[];
};

export type Check = { caseId: string; kind: "recall" | "date" | "noise" | "answer" | "honesty"; what: string; ok: boolean; detail: string };
export type MemoryResults = {
  ranAt: string;
  model: string;
  note: string;
  cases: number;
  modelCalls: number;
  recall: { right: number; total: number };
  dates: { right: number; total: number };
  noise: { clean: number; total: number };
  answers: { right: number; total: number };
  honesty: { right: number; total: number };
  checks: Check[];
};

const matches = (text: string, any: string[]) => any.some((p) => new RegExp(p, "i").test(text));
/** The moment a scripted line was "sent": a day relative to now, at an Indian clock time. */
const moment = (day: number, time: string, now: number) => new Date(`${todayIST(now + day * DAY)}T${time}:00+05:30`).toISOString();

async function runCase(c: Case, now: number): Promise<{ checks: Check[]; calls: number }> {
  const db: DB = emptySpace();
  const contact: Contact = { id: "person", name: c.contact.name, relation: c.contact.relation, close: true, lastContactAt: new Date(now).toISOString() };
  db.contacts.push(contact);
  const checks: Check[] = [];
  let calls = 0;
  const add = (kind: Check["kind"], what: string, ok: boolean, detail: string) => checks.push({ caseId: c.id, kind, what, ok, detail });

  // Equal reads the chat one message at a time, exactly as it would as the messages arrived.
  for (const line of c.messages) {
    const msg: Message = { id: uid(), contactId: contact.id, from: line.from, text: line.text, at: moment(line.day, line.time, now) };
    db.messages.push(msg);
    const error = await analyse(db, contact, msg, true);
    calls++;
    if (error) throw new Error(error);
  }
  // Things the user tells Equal directly, through the same question box the app has.
  for (const told of c.tell ?? []) {
    await askEqual(db, told);
    calls++;
  }

  const kept = db.memories;
  const text = (m: Memory) => m.fact;
  const all = kept.map(text).join(" | ") || "(nothing kept)";

  for (const f of c.facts) {
    const found = kept.filter((m) => matches(text(m), f.any) && (!f.about || (m.about ?? "contact") === f.about));
    add("recall", f.label, found.length > 0, found.length ? found[0].fact : `not kept. Kept: ${all}`);
    if (f.day !== undefined && found.length) {
      const want = todayIST(now + f.day * DAY);
      const got = found.map((m) => (m.when ? todayIST(Date.parse(m.when)) : "no date"));
      add("date", `${f.label} is on the right day`, got.includes(want), `expected ${want}, got ${got.join(", ")}`);
    }
  }
  for (const n of c.noise ?? []) {
    const wrong = kept.filter((m) => matches(text(m), [n]));
    add("noise", `"${n}" is not kept as a fact`, wrong.length === 0, wrong.length ? wrong[0].fact : "left out");
  }
  if (c.maxFacts !== undefined) add("noise", `small talk keeps at most ${c.maxFacts} facts`, kept.length <= c.maxFacts, all);
  if (c.maxMatching) {
    const n = kept.filter((m) => matches(text(m), c.maxMatching!.any)).length;
    add("noise", `the same thing said twice is not kept more than ${c.maxMatching.count} times`, n <= c.maxMatching.count, `${n} kept: ${all}`);
  }
  if (c.resolved) {
    const open = kept.filter((m) => matches(text(m), c.resolved!.any) && m.status === "open" && m.when);
    add("recall", "a plan that was then done is no longer an open reminder", open.length === 0, open.length ? `still open: ${open[0].fact}` : "closed");
  }

  for (const q of c.questions) {
    const a = await askEqual(db, q.q);
    calls++;
    if (a.error) throw new Error(a.error);
    if (q.unknown) add("honesty", q.q, !a.known, a.known ? `guessed: ${a.answer}` : "declined, as it should");
    else add("answer", q.q, a.known && matches(a.answer, q.any ?? []), a.answer || "(no answer)");
  }
  return { checks, calls };
}

export async function runMemoryBenchmark(note = ""): Promise<MemoryResults> {
  const { cases } = JSON.parse(fs.readFileSync(CASES, "utf8")) as { cases: Case[] };
  const now = Date.now();
  const checks: Check[] = [];
  let modelCalls = 0;
  for (const c of cases) {
    const r = await runCase(c, now);
    checks.push(...r.checks);
    modelCalls += r.calls;
  }
  const tally = (kind: Check["kind"]) => ({ right: checks.filter((x) => x.kind === kind && x.ok).length, total: checks.filter((x) => x.kind === kind).length });
  const noise = tally("noise");
  const results: MemoryResults = {
    ranAt: new Date(now).toISOString(),
    model: activeModel(),
    note,
    cases: cases.length,
    modelCalls,
    recall: tally("recall"),
    dates: tally("date"),
    noise: { clean: noise.right, total: noise.total },
    answers: tally("answer"),
    honesty: tally("honesty"),
    checks,
  };
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1));
  return results;
}

export function lastMemoryResults(): MemoryResults | null {
  try {
    return JSON.parse(fs.readFileSync(RESULTS, "utf8")) as MemoryResults;
  } catch {
    return null;
  }
}
