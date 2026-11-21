// Unit tests for the WhatsApp export reader. No server, no network, no model:
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWhatsApp, sendersOf, guessMe } from "../../lib/whatsapp.ts";

const NB = " ";

test("reads an Android 12-hour export, with the narrow space before pm", () => {
  const out = parseWhatsApp([`21/11/26, 5:41${NB}pm - Sai: Anna, ekkada unnav?`, `21/11/26, 5:42${NB}pm - Haresh: Office lo unna.`].join("\n"));
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((m) => m.sender), ["Sai", "Haresh"]);
  assert.equal(out[0].at, "2026-11-21T12:11:00.000Z"); // 5:41 pm in India
});

test("reads an iPhone export with brackets, seconds and direction marks", () => {
  const out = parseWhatsApp("[20/11/26, 9:05:10 AM] Priya: ‎Visa interview December 3 ki");
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Visa interview December 3 ki");
  assert.equal(out[0].at, "2026-11-20T03:35:00.000Z");
});

test("reads 24-hour times, dotted dates and four-digit years", () => {
  const out = parseWhatsApp("21.11.2026, 17:48 - Kiran: Review at 11 tomorrow");
  assert.equal(out[0].at, "2026-11-21T12:18:00.000Z");
});

test("works out month-first dates from a value over 12", () => {
  const out = parseWhatsApp("11/21/26, 5:48 PM - Ravi: Trip plan ready");
  assert.equal(out[0].at, "2026-11-21T12:18:00.000Z");
});

test("reads year-first dates", () => {
  const out = parseWhatsApp("2026-11-21, 17:48 - Ravi: ok");
  assert.equal(out[0].at, "2026-11-21T12:18:00.000Z");
});

test("keeps a message that runs over several lines as one message", () => {
  const out = parseWhatsApp(["21/11/26, 5:42 pm - Haresh: Office lo unna.", "Inko gantalo vastha."].join("\n"));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Office lo unna.\nInko gantalo vastha.");
});

test("drops WhatsApp's own notices, media placeholders and deleted messages", () => {
  const out = parseWhatsApp(
    [
      "21/11/26, 5:40 pm - Messages and calls are end-to-end encrypted. Only people in this chat can read them.",
      "21/11/26, 5:41 pm - Sai: <Media omitted>",
      "21/11/26, 5:42 pm - Sai: This message was deleted",
      "21/11/26, 5:43 pm - Sai: image omitted",
      "21/11/26, 5:44 pm - Sai: Dinner at 8:30",
    ].join("\n")
  );
  assert.deepEqual(out.map((m) => m.text), ["Dinner at 8:30"]);
});

test("a notice is not glued onto the message before it", () => {
  const out = parseWhatsApp(["21/11/26, 5:41 pm - Sai: Hello", "21/11/26, 5:42 pm - Sai added Ravi"].join("\n"));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "Hello");
});

test("returns nothing for text that is not an export", () => {
  assert.deepEqual(parseWhatsApp("just some notes\nwith no dates"), []);
  assert.deepEqual(parseWhatsApp(""), []);
});

test("rejects impossible dates and times instead of guessing", () => {
  assert.deepEqual(parseWhatsApp("45/45/26, 5:41 pm - Sai: Hello"), []);
  assert.deepEqual(parseWhatsApp("21/11/26, 29:99 - Sai: Hello"), []);
});

test("lists the speakers, most talkative first", () => {
  const out = parseWhatsApp(["21/11/26, 5:41 pm - A: 1", "21/11/26, 5:42 pm - B: 2", "21/11/26, 5:43 pm - B: 3"].join("\n"));
  assert.deepEqual(sendersOf(out), ["B", "A"]);
});

test("picks out the user by an exact name or a shared name-word, and refuses to guess otherwise", () => {
  assert.equal(guessMe(["Sai Abhijit", "Haresh"], "Haresh Gundela"), "Haresh");
  assert.equal(guessMe(["Sai", "haresh gundela"], "Haresh Gundela"), "haresh gundela");
  assert.equal(guessMe(["Priya", "HG"], "Haresh Gundela"), null); // not clear: the app asks
  assert.equal(guessMe(["Haresh K", "Haresh G"], "Haresh"), null); // two candidates: the app asks
  assert.equal(guessMe(["A", "B"], ""), null);
});
