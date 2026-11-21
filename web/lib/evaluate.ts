import fs from "fs";
import path from "path";
import { seed, uid, Message } from "./store";
import { analyse, activeModel } from "./butler";
import { checkScam } from "./scam";

/**
 * The scoreboard. It runs a fixed set of hand-written messages through the SAME code the app
 * uses (the reading of a message, and the scam check) and records what happened.
 * Results are kept in a file so the page can show them without spending anything.
 */

const DIR = path.join(process.cwd(), "eval");
const CASES = path.join(DIR, "cases.json");
const RESULTS = path.join(DIR, "results.json");

type Case = { text: string; expect: string; seen?: boolean };
export type Outcome = { text: string; expect: string; seen?: boolean; got: string; ok: boolean; detail: string };
export type Results = {
  ranAt: string;
  model: string;
  note: string;
  /** Messages never used while building the app: the fairer number. */
  unseen: { right: number; total: number };
  gate: { speakRight: number; speakTotal: number; quietRight: number; quietTotal: number; outcomes: Outcome[] };
  scam: { caught: number; scamTotal: number; leftAlone: number; genuineTotal: number; outcomes: Outcome[] };
};

/** Should the assistant offer help? Uses a fresh space, exactly as a new chat would. */
async function gateCase(c: Case): Promise<Outcome> {
  const db = seed();
  const contact = db.contacts.find((x) => x.id === "ravi")!;
  const msg: Message = { id: uid(), contactId: contact.id, from: "me", text: c.text, at: new Date().toISOString() };
  db.messages.push(msg);
  const error = await analyse(db, contact, msg);
  if (error) return { ...c, got: "error", ok: false, detail: error };
  const offer = db.suggestions.find((s) => s.type === "intent");
  const gate = db.gateLog.find((g) => g.messageId === msg.id);
  const got = offer ? "speak" : "quiet";
  return { ...c, got, ok: got === c.expect, detail: offer ? offer.title : gate?.reason ?? "no practical need seen" };
}

/** Should the message be flagged as a scam? */
async function scamCase(c: Case): Promise<Outcome> {
  const db = seed();
  const contact = db.contacts.find((x) => x.id === "unknown-me")!;
  const msg: Message = { id: uid(), contactId: contact.id, from: "them", text: c.text, at: new Date().toISOString() };
  db.messages.push(msg);
  const error = await checkScam(db, contact, msg);
  if (error) return { ...c, got: "error", ok: false, detail: error };
  const got = msg.scam ? "scam" : "genuine";
  return { ...c, got, ok: got === c.expect, detail: msg.scam ? `${msg.scam.pattern}: ${msg.scam.reason}` : "not flagged" };
}

/** Run a few at a time: quick, without flooding the model. */
async function inBatches<T, R>(items: T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return out;
}

export async function runScoreboard(note: string): Promise<Results> {
  const cases = JSON.parse(fs.readFileSync(CASES, "utf8")) as { gate: Case[]; scam: Case[] };
  const gate = await inBatches(cases.gate, 6, gateCase);
  const scam = await inBatches(cases.scam, 6, scamCase);
  const count = (list: Outcome[], expect: string) => list.filter((o) => o.expect === expect);
  const results: Results = {
    ranAt: new Date().toISOString(),
    model: activeModel(),
    note,
    unseen: { right: [...gate, ...scam].filter((o) => !o.seen && o.ok).length, total: [...gate, ...scam].filter((o) => !o.seen).length },
    gate: {
      speakRight: count(gate, "speak").filter((o) => o.ok).length,
      speakTotal: count(gate, "speak").length,
      quietRight: count(gate, "quiet").filter((o) => o.ok).length,
      quietTotal: count(gate, "quiet").length,
      outcomes: gate,
    },
    scam: {
      caught: count(scam, "scam").filter((o) => o.ok).length,
      scamTotal: count(scam, "scam").length,
      leftAlone: count(scam, "genuine").filter((o) => o.ok).length,
      genuineTotal: count(scam, "genuine").length,
      outcomes: scam,
    },
  };
  fs.writeFileSync(RESULTS, JSON.stringify(results, null, 1));
  return results;
}

export function lastResults(): Results | null {
  try {
    return JSON.parse(fs.readFileSync(RESULTS, "utf8")) as Results;
  } catch {
    return null;
  }
}
