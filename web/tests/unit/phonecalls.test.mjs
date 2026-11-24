// Unit tests for matching the phone's call log to people in My Equal, on the phone.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { callsToTouches, matchName, numberKey } from "../../lib/phonecalls.ts";
import { inTouch } from "../../lib/touch.ts";

const people = [
  { id: "amma", name: "Amma" },
  { id: "ravi", name: "Ravi" },
  { id: "priya-s", name: "Priya Sharma" },
  { id: "priya-k", name: "Priya Kumar" },
  { id: "x", name: "+91 90000 12345", unknown: true },
];
const day = (n) => Date.UTC(2026, 10, n, 12);

test("names from the phone match a person when it is clear, and only then", () => {
  assert.equal(matchName("Amma", people)?.id, "amma");
  assert.equal(matchName("amma ❤️", people)?.id, "amma");
  assert.equal(matchName("Ravi Kumar", people)?.id, "ravi"); // first name only one person here has
  assert.equal(matchName("Priya Sharma", people)?.id, "priya-s");
  assert.equal(matchName("Priya", people), undefined); // two Priyas: not guessed
  assert.equal(matchName("Dentist", people), undefined);
  assert.equal(matchName(null, people), undefined);
});

test("numbers compare by their last ten digits", () => {
  assert.equal(numberKey("+91 98480-22338"), "9848022338");
  assert.equal(numberKey("09848022338"), "9848022338");
});

test("each kind of call becomes the right touch; blocked calls and strangers are left out", () => {
  const calls = [
    { number: "+919800000001", name: "Amma", type: 1, at: day(20), secs: 300 }, // incoming
    { number: "+919800000001", name: "Amma", type: 2, at: day(21), secs: 0 }, // outgoing, no answer
    { number: "+919800000002", name: "Ravi", type: 3, at: day(22), secs: 0 }, // missed
    { number: "+919800000002", name: "Ravi", type: 6, at: day(22), secs: 0 }, // blocked
    { number: "+919811111111", name: "Dentist", type: 1, at: day(23), secs: 60 },
    { number: "+919811111111", name: "Dentist", type: 1, at: day(24), secs: 60 },
  ];
  const { touches, unmatched } = callsToTouches(calls, people);
  assert.deepEqual(
    touches.map((t) => [t.contactId, t.kind, t.dir, t.mins]),
    [
      ["amma", "call", "in", 5],
      ["amma", "missed", "out", undefined],
      ["ravi", "missed", "in", undefined],
    ],
  );
  assert.deepEqual(unmatched, [{ number: "+919811111111", name: "Dentist", calls: 2 }]);
});

test("a number linked by hand wins over the name", () => {
  const { touches } = callsToTouches([{ number: "98000 00009", name: "Dentist", type: 2, at: day(20), secs: 120 }], people, { "9800000009": "ravi" });
  assert.equal(touches[0].contactId, "ravi");
});

test("a real phone call counts as being in touch; a missed one does not", () => {
  const { touches } = callsToTouches([{ number: "1", name: "Amma", type: 3, at: day(20), secs: 0 }, { number: "1", name: "Amma", type: 1, at: day(18), secs: 120 }], people);
  const t = inTouch({ messages: [], touches }, "amma");
  assert.equal(new Date(t.last).toISOString().slice(0, 10), "2026-11-18");
});
