# How My Equal manages context

Context is the product. This page says exactly what the model is given, what is stored, how it is kept small, how it is checked, and where it falls short of the state of practice.

## The design in one sentence

**Extract-then-retrieve structured memory with message-level provenance, over a per-user people graph, with deterministic reminders.** The model never reads a whole chat. It reads a small, ranked slice, turns it into structured facts, and plain code does the rest.

This is the same principle large data platforms use for their assistants: ground the model in curated, governed context instead of giving it everything. (Databricks' Genie, for example, answers from table metadata, a capped set of instructions and example queries, not from the raw data.) My Equal applies it at the scale of one person's life.

## What is stored: the memory model

```
Person (contact)                         Fact (memory)
  name                                     text            "Eye check-up at LV Prasad"
  relation      brother, close friend…     kind            event | promise | worry | preference
  close         keep them close? yes/no    when            a date, or a date and time, or none
  relationSource  inferred | user          about           the user's life, or the contact's
  relationWhy   why Equal thinks so        status          open | done
  lastContactAt                            sourceMessageId the message it came from (provenance)
  readAt, starred                          important, remindAt, callMe   (reminders the user asked for)
```

- **Per user.** Each person has a private space. A message between two people is stored once in each space, and each side's own assistant reads its own copy. Nobody's facts are visible to anyone else.
- **Provenance.** Every fact extracted from a chat points at its source message. Edit the message and its facts are dropped and re-read. Delete it and they are deleted.
- **The user's word wins.** A relationship the user sets is never overwritten by inference. Facts can be added by hand, told to Equal in plain words ("Remember that Abhishek is allergic to peanuts"), or forgotten with one tap.

## What the model is given

| Call | Given to the model | Hard cap |
|---|---|---|
| Reading a new message | the last messages of that one chat; known facts about that person; the person's name and relationship | 12 messages, 40 facts |
| Answering a question | facts and messages that best match the question; the list of people | 80 facts, 45 messages |
| Working out a relationship | recent messages of one chat | 60 messages |
| Setting a reminder | the message and the lines around it | 8 messages |

**Ranking, when there are more facts than fit** (`web/lib/butler.ts`, `analyse`):
1. facts sharing a word with the new message, so nothing is saved twice and a finished plan can be marked done;
2. dated facts nearest to today;
3. the newest undated facts.

Word matching works in any script (Latin, Telugu, Devanagari); combining marks are kept so Indian-script words are not cut apart.

**One message can add at most 4 facts**, whatever the model or a crafted message proposes.

## What the model is not asked to do

The model interprets. It does not keep state and it does not decide when to interrupt.

- **Reminders** fire from dates, in plain code (`computeNudges` in `web/lib/store.ts`).
- **"You haven't spoken in a while"** compares the silence with how often those two people usually talk, in plain code (`rhythmDays`).
- **How long before an event to ring** is a fixed table: 3 hours for a flight, 75 minutes for a train, 15 minutes for a meeting (`web/lib/remind.ts`).
- **Which quote wins** in a call-around is a rule, not a model opinion.
- **Nothing is sent, booked or paid** without the user's tap.

The model's output is structured JSON with a fixed shape: facts to remember, facts now resolved, and "speak or stay quiet, and why". It has no tools.

## Why not a bigger context window

Three reasons, the first two measurable:

1. **Cost and speed grow with input.** The status page (`/status`) shows the measured size of each call. It stays roughly flat however long a chat gets.
2. **Accuracy falls as input grows.** This is documented ("Lost in the Middle", Liu et al. 2023; Chroma's "Context Rot" study across 18 models, 2025).
3. **A small, selected context can be audited.** Each fact names the message it came from, and each time Equal stays quiet it says why.

## How it is observed

Every model call is timed and its token counts recorded by purpose (`web/lib/metrics.ts`), and one structured log line is written with no message text in it (`web/lib/log.ts`).

- `/status`: live view: calls, typical and slowest time, context size per kind of call, share of input served from the provider's prompt cache.
- `/api/metrics`: the same as JSON.
- `/api/health`: for an uptime monitor.

## How it is checked

- **Decision quality** (speak, or stay quiet; scam, or genuine): 60 hand-written messages in English, Hindi and Telugu, scored at `/scoreboard`. It is the builder's own set and it is easy; a perfect score says so.
- **Behaviour**: 17 end-to-end suites exercise memory through the real app: facts are extracted, deduplicated, dropped on edit and delete, kept private between two accounts, and answered back with sources.
- **Memory accuracy**: a benchmark in the style of LongMemEval, at small scale (`web/lib/memory-eval.ts`, cases in `web/eval/memory-cases.json`). Scripted chats in English and Telugu-English are read by the same code the app uses, with the real model, and five things are measured: **recall** (expected facts kept), **dates** (relative dates resolved to the right day), **noise** (small talk not kept), **answers** (questions answered from memory) and **honesty** (questions with no answer declined, not guessed). Results and every miss are shown at `/scoreboard`. It is eight chats written by the builder, so it is evidence, not proof; a larger independent set is the next step.

## Where it falls short, and the next step for each

| Gap | Why it matters | Next step |
|---|---|---|
| Retrieval is by word overlap | "eye test" will not find "check-up"; "mum" will not find "mother" | Embeddings with hybrid (keyword plus vector) search and rank fusion |
| Facts have no validity period | "moved to Pune" does not retire "lives in Hyderabad"; only open or done | `validFrom`, `validTo`, `supersededBy` on each fact, as temporal knowledge graphs do (Zep / Graphiti) |
| Each message is read once | a correction 30 messages later is read without what it corrects | A periodic consolidation pass over a chat's facts |
| The memory benchmark is small | eight chats, written by the builder | A larger set from other people, run in CI against a recorded model |
| Message text goes to a hosted model | privacy and data residency; rules out end-to-end encryption | On-device or private-deployment models for extraction |
| One file, one process | see [ARCHITECTURE.md](ARCHITECTURE.md) | Per-user rows in Postgres; model calls on a queue |

## Sources for the claims about other systems

- Databricks Genie and its curated context: https://docs.databricks.com/aws/en/genie/ and https://docs.databricks.com/aws/en/genie/trusted-assets
- "Ontology" as a term comes from Palantir Foundry (object, link and action types): https://palantir.com/docs/foundry/ontology/overview/
- Fact extraction memory (Mem0): https://arxiv.org/abs/2504.19413
- Temporal knowledge graph memory (Zep): https://arxiv.org/abs/2501.13956
- Tiered memory (MemGPT): https://arxiv.org/abs/2310.08560
- Lost in the Middle: https://arxiv.org/abs/2307.03172 · Context Rot: https://research.trychroma.com/context-rot
- Memory benchmarks: LoCoMo https://arxiv.org/abs/2402.17753 · LongMemEval https://arxiv.org/abs/2410.10813
