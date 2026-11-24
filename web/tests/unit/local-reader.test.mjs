// Unit tests for the on-device reader. A scripted stand-in replaces the model, so these check what
// plain code decides: dates, who a fact is about, its wording, moods, and which facts may be closed.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { DONE_SYSTEM, FACT_SYSTEM, TONE_SYSTEM, candidatesToClose, dayChoices, readLocally } from "../../lib/local-reader.ts";

const at = "2026-11-24T10:00:00+05:30"; // a Tuesday
const line = (from, text) => ({ from, text, at });

/** A fake model: answers by which question it is asked, and records what it was shown. */
function fake(answers) {
  const asked = [];
  const generate = async (system, user, schema) => {
    asked.push({ system, user: JSON.parse(user), schema });
    const which = system === FACT_SYSTEM ? "fact" : system === TONE_SYSTEM ? "tone" : system === DONE_SYSTEM ? "done" : "?";
    return JSON.stringify(answers[which] ?? {});
  };
  return { generate, asked };
}

test("the model picks a day from a list; code turns it into a date", () => {
  const days = dayChoices(Date.parse(at));
  assert.deepEqual(days.slice(0, 3), [
    { label: "none", date: null },
    { label: "today", date: "2026-11-24" },
    { label: "tomorrow", date: "2026-11-25" },
  ]);
  assert.equal(days[3].label, "day after tomorrow, Thu 26 Nov");
  assert.equal(days[4].label, "Fri 27 Nov");
  assert.equal(days.at(-1).date, "2026-12-01");
});

test("a promise of theirs becomes a dated promise about them, named, with the time", async () => {
  const { generate, asked } = fake({ fact: { found: true, quote: "I'll book the train tickets and send the PDF", promise: true, day: "tomorrow", time: "9:30" }, tone: { mood: "neutral" } });
  const a = await readLocally(generate, { name: "Bala" }, [line("me", "Did you book?")], line("them", "Sure, I'll book the train tickets and send the PDF tomorrow morning"), []);
  assert.deepEqual(a.memories, [{ fact: "Bala: I'll book the train tickets and send the PDF", about: "contact", kind: "promise", when: "2026-11-25T09:30" }]);
  assert.equal(a.tone, null); // neutral is not kept
  assert.equal(asked[0].schema.properties.day.enum[2], "tomorrow"); // the day can only be one of the list
  assert.deepEqual(asked[0].user.CHAT, ["me: Did you book?"]);
});

test("my own plan is a note about me, and nothing is asked about my tone", async () => {
  const { generate, asked } = fake({ fact: { found: true, quote: "Thursday Inorbit lo kaluddam", promise: false, day: "day after tomorrow, Thu 26 Nov", time: "" } });
  const a = await readLocally(generate, { name: "Rohit" }, [], line("me", "Thursday Inorbit lo kaluddam"), []);
  assert.deepEqual(a.memories, [{ fact: "Thursday Inorbit lo kaluddam", about: "user", kind: "event", when: "2026-11-26" }]);
  assert.ok(!asked.some((q) => q.system === TONE_SYSTEM));
});

test("nothing found, an empty or short quote, or a quote not in the message keeps nothing", async () => {
  for (const fact of [
    { found: false, quote: "ok", promise: false, day: "none", time: "" },
    { found: true, quote: "", promise: false, day: "today", time: "" },
    { found: true, quote: "ok", promise: false, day: "today", time: "" },
    { found: true, quote: "Buy flowers for the anniversary party", promise: true, day: "today", time: "" },
  ]) {
    const a = await readLocally(fake({ fact }).generate, { name: "Ravi" }, [], line("me", "ok"), []);
    assert.deepEqual(a.memories, []);
  }
  const odd = await readLocally(fake({ fact: { found: true, quote: "dinner plan with everyone", promise: false, day: "someday", time: "25:99" } }).generate, { name: "Ravi" }, [], line("me", "dinner plan with everyone?"), []);
  assert.equal(odd.memories[0].when, null); // a day not on the list and a bad time are dropped
});

test("their low mood is noted with a note code writes; unknown moods are ignored", async () => {
  const sad = await readLocally(fake({ fact: { found: false }, tone: { low: true, mood: "sad" } }).generate, { name: "Priya" }, [], line("them", "chala low ga undi"), []);
  assert.deepEqual(sad.tone, { mood: "sad", note: "Priya sounds sad." });
  const odd = await readLocally(fake({ fact: { found: false }, tone: { low: true, mood: "furious-ish" } }).generate, { name: "Priya" }, [], line("them", "hmm"), []);
  assert.equal(odd.tone, null);
  const notLow = await readLocally(fake({ fact: { found: false }, tone: { low: false, mood: "sad" } }).generate, { name: "Priya" }, [], line("them", "ok see you"), []);
  assert.equal(notLow.tone, null); // the yes/no answer decides; the mood alone does not
});

test("only facts sharing words with the message are checked for being done, and only those can close", async () => {
  const known = [
    { id: "k1", fact: "Send Ravi the project deck", when: null },
    { id: "k2", fact: "Dentist on Friday", when: null },
  ];
  assert.deepEqual(candidatesToClose("Sent you the project deck just now", known).map((k) => k.id), ["k1"]);
  const { generate, asked } = fake({ fact: { found: false }, done: { done: true } });
  const a = await readLocally(generate, { name: "Ravi" }, [], line("me", "Sent you the project deck just now"), known);
  assert.deepEqual(a.resolved, ["k1"]);
  assert.equal(asked.filter((q) => q.system === DONE_SYSTEM).length, 1);
});

test("an answer that is not JSON keeps nothing", async () => {
  const generate = async () => "not json at all";
  const a = await readLocally(generate, { name: "Ravi" }, [], line("them", "I'll call you tonight"), [{ id: "k1", fact: "call tonight", when: null }]);
  assert.deepEqual(a, { memories: [], resolved: [], tone: null });
});

test("long messages are cut before they reach the model", async () => {
  const { generate, asked } = fake({ fact: { found: false } });
  await readLocally(generate, { name: "Ravi" }, [], line("me", "x".repeat(2000)), []);
  assert.ok(asked[0].user.NEWEST.length < 220);
});

test("a quote that comes back with the speaker in front is cleaned, and day after tomorrow is a choice", async () => {
  const { generate } = fake({ fact: { found: true, quote: "Anna: Eye check-up at LV Prasad on Thursday", promise: false, day: "day after tomorrow, Thu 26 Nov", time: "10:30" }, tone: { mood: "neutral" } });
  const a = await readLocally(generate, { name: "Anna" }, [], line("them", "Eye check-up at LV Prasad on Thursday, 10:30"), []);
  assert.deepEqual(a.memories, [{ fact: "Anna: Eye check-up at LV Prasad on Thursday", about: "contact", kind: "event", when: "2026-11-26T10:30" }]);
  const mine = await readLocally(fake({ fact: { found: true, quote: "me: I'll send the slides", promise: true, day: "today", time: "" } }).generate, { name: "Ravi" }, [], line("me", "I'll send the slides"), []);
  assert.equal(mine.memories[0].fact, "I'll send the slides");
});

test("days named in the message are read by code, in English, Telugu and Hindi", async () => {
  const { dayFromWords } = await import("../../lib/local-reader.ts");
  const t = Date.parse(at); // Tuesday 24 Nov
  assert.equal(dayFromWords("I'll book the tickets tomorrow", t), "2026-11-25");
  assert.equal(dayFromWords("Sare, repu call chesta", t), "2026-11-25");
  assert.equal(dayFromWords("ellundi vastanu", t), "2026-11-26");
  assert.equal(dayFromWords("Call you tonight", t), "2026-11-24");
  assert.equal(dayFromWords("Aaj shaam milte hain", t), "2026-11-24");
  assert.equal(dayFromWords("Dentist on Friday", t), "2026-11-27");
  assert.equal(dayFromWords("See you Monday", t), "2026-11-30");
  assert.equal(dayFromWords("Kal milte hain", t), null); // "kal" is both yesterday and tomorrow: the model decides
  assert.equal(dayFromWords("Good morning", t), null);
});

test("a day named in the message wins over the model's pick", async () => {
  const { generate } = fake({ fact: { found: true, quote: "I'll book the train tickets tomorrow", promise: true, day: "today", time: "" }, tone: { low: false, mood: "sad" } });
  const a = await readLocally(generate, { name: "Asha" }, [], line("them", "I'll book the train tickets tomorrow and send you the PDF"), []);
  assert.equal(a.memories[0].when, "2026-11-25");
});
