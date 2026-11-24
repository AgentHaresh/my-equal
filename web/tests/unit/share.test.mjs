// Unit tests for asking the cloud model about private chats: what the phone offers to send, and what the server accepts.
//   node --test tests/unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { SHARE_LIMITS, cleanShared, pickPrivate, toShared } from "../../lib/share.ts";

const people = [
  { id: "c-asha", name: "Asha Rao" },
  { id: "c-kiran", name: "Kiran" },
];
const at = (d) => `2026-11-${String(d).padStart(2, "0")}T10:00:00.000Z`;
const messages = [
  { id: "m1", contactId: "c-asha", from: "them", text: "Our new flat is in Kondapur, block C.", at: at(20) },
  { id: "m2", contactId: "c-asha", from: "me", text: "Lovely, I'll visit on Sunday.", at: at(21) },
  { id: "m3", contactId: "c-kiran", from: "them", text: "The sprint review moved to Friday.", at: at(22) },
  { id: "m4", contactId: "c-kiran", from: "butler", text: "Equal's own note", at: at(22) },
];
const facts = [{ id: "f1", contactId: "c-asha", fact: "Asha: I'll book the train tickets tomorrow.", when: at(25), status: "open" }];

test("a question naming a person offers that person's private lines and what the phone noted", () => {
  const items = pickPrivate("Where is Asha's new flat?", people, messages, facts);
  assert.deepEqual(items.map((i) => i.key).sort(), ["m:m1", "m:m2", "n:f1"].sort());
  assert.ok(items.every((i) => i.who === "Asha Rao"));
  const flat = items.find((i) => i.key === "m:m1");
  assert.equal(flat.line, "Asha Rao: Our new flat is in Kondapur, block C.");
  assert.equal(items.find((i) => i.key === "m:m2").line, "You: Lovely, I'll visit on Sunday.");
});

test("word matches find lines without a name, and Equal's own notes are never offered", () => {
  const items = pickPrivate("when is the sprint review", people, messages, facts);
  assert.deepEqual(items.map((i) => i.key), ["m:m3"]);
});

test("nothing private fits: nothing is offered, so nothing is asked", () => {
  assert.deepEqual(pickPrivate("what's the weather like", people, messages, facts), []);
});

test("only the approved lines are sent, in the shape the server takes", () => {
  const items = pickPrivate("Where is Asha's new flat?", people, messages, facts).filter((i) => i.key !== "m:m2");
  const shared = toShared(items);
  assert.deepEqual(shared.messages, [{ chat_with: "Asha Rao", from: "Asha Rao", text: "Our new flat is in Kondapur, block C.", date: "2026-11-20" }]);
  assert.equal(shared.notes.length, 1);
  assert.deepEqual(cleanShared(shared), shared);
});

test("the server drops malformed entries and caps the rest", () => {
  assert.equal(cleanShared(null), undefined);
  assert.equal(cleanShared({ messages: "x", notes: 3 }), undefined);
  assert.equal(cleanShared({ messages: [{ text: "no names" }], notes: [{ with: "A" }] }), undefined);
  const many = { messages: Array.from({ length: 50 }, () => ({ chat_with: "A".repeat(500), from: "me", text: "x".repeat(5000), date: "2026-11-20T00:00" })) };
  const out = cleanShared(many);
  assert.equal(out.messages.length, SHARE_LIMITS.messages);
  assert.equal(out.messages[0].text.length, SHARE_LIMITS.text);
  assert.equal(out.messages[0].chat_with.length, SHARE_LIMITS.name);
  assert.equal(out.messages[0].date, "2026-11-20");
});
