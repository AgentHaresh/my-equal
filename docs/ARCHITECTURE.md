# Architecture

What runs, how the parts fit, what was measured, and what it would take to run this for real. Written to be checked against the code: every claim names a file.

## The shape today

```
 Phone or browser (installable web app)
        │  HTTPS (Caddy)
        ▼
 ┌─────────────────────────── one Node process (Next.js) ───────────────────────────┐
 │  app/api/*/route.ts   thin HTTP routes: check sign-in, validate, call lib, reply  │
 │  lib/*.ts             the logic, one concern per file                             │
 │     store.ts     one private space per person                                     │
 │     storage.ts   SQLite: one row per person, only changed rows written, AES-256   │
 │     butler.ts    reading a message with the model; askJson() wraps every call     │
 │     ask.ts, remind.ts, people.ts, calls.ts, scam.ts, screen.ts, photo.ts          │
 │     deliver.ts, edit.ts, files.ts, scheduled.ts, rtc.ts                           │
 │     live.ts      server-sent events: "something changed"                          │
 │     push.ts      notifications to closed apps                                     │
 │     auth.ts, otp.ts, ratelimit.ts                                                 │
 │     log.ts, metrics.ts                                                            │
 └───────────────┬───────────────────────────────┬───────────────────────────────────┘
                 │                               │
        data/equal.db, data/files/        OpenAI (text, vision, speech)
        (SQLite, encrypted at rest)       SMS service · browser push services
```

**The rule that shapes the code: the model interprets, plain code holds state and rules, a person approves every action.** See [CONTEXT.md](CONTEXT.md).

## Request path, by example: sending a message

1. `POST /api/messages` → `lib/deliver.ts`. The message is stored in the sender's space, and a copy in the recipient's, linked by a shared `pair` id so an edit, delete or reaction reaches both.
2. `save()` writes only the rows that changed, the two people's, in one transaction (`lib/storage.ts`), then `poke()` tells every open app that something changed (`lib/live.ts`).
3. Each open app holds one server-sent-events connection. On a nudge it asks `/api/state?v=<version>`. If its state has not changed the answer is 36 bytes; otherwise it is the new state.
4. If the recipient's app is closed, a notification goes out (`lib/push.ts`).
5. In the background, each side's assistant reads its own copy with the model (`analyse` in `lib/butler.ts`): 12 messages and at most 40 ranked facts. The message is delivered whether or not that call succeeds.

## Measured, not estimated

| | Value | Where it comes from |
|---|---|---|
| Code the browser downloads | 216 KB compressed | build output |
| A message reaching the other open screen | about 0.3 s on the live site, 0.09 s locally | `tests/live-test.mjs` |
| A check when nothing has changed | 36 bytes | `tests/live-test.mjs` |
| Model call time and tokens, per purpose | live | `/status` (from `lib/metrics.ts`) |
| Tests | 30 unit tests; 17 end-to-end suites | `npm test`, `npm run test:e2e` |
| Memory accuracy | recall, dates, noise, answers, honesty | `/scoreboard` (from `lib/memory-eval.ts`) |

## Observability

- **Health:** `GET /api/health`. No sign-in, no personal data. 200 when the store is readable and the assistant has a model; 503 otherwise.
- **Metrics:** `GET /api/metrics` (a signed-in session, or `Authorization: Bearer $METRICS_TOKEN`). Counters and timing percentiles: model calls by purpose, failures, tokens in and out, cached share, save time, messages, notifications, requests refused by rate limits. Shown at `/status`.
- **Logs:** one JSON object per line (`lib/log.ts`): `model.call`, `model.call_failed`, `model.fallback`, `store.load_failed`, `scheduler.tick_failed`. Ids, durations and outcomes only. **Message text, names and phone numbers are never logged.**
- **Not there yet:** request-level traces across services (OpenTelemetry), alerting, log shipping. With one process, `journalctl` is the log store.

## Failure behaviour

| What fails | What happens |
|---|---|
| The model is slow | A call is abandoned after 45 seconds (`MODEL_TIMEOUT_MS`). The message is already delivered. |
| The model is down or refuses | Messaging, stored facts, reminders and nudges keep working: they are plain code. That message is not read for facts; the chat shows that Equal could not read it. There is no retry queue yet. |
| The configured model name is wrong | One fallback model is tried and the switch is logged. |
| A text message cannot be sent | Sign-in falls back to showing the code on screen with the reason (a demo setting; see [SECURITY.md](../SECURITY.md)). |
| The process crashes mid-save | The database runs in write-ahead mode and each save is one transaction: all of it lands or none. |
| The data cannot be read (wrong key, damaged file) | The app refuses to start empty on top of it: the error is logged and the health check turns 503. Starting empty would overwrite the data at the next save. |

## Scale: what breaks first, and the path past it

This is one process with an embedded database. It is honest to call it a working product for hundreds of people and a prototype beyond that.

| Limit today | Breaks at about | What replaces it | What stays the same |
|---|---|---|---|
| One row per person, held as one document, in an embedded database | a person with tens of thousands of messages; more than one server | Postgres: one row per message and per fact, keyed by user | `lib/storage.ts` is the only file that touches the disk; every function already takes one person's space (`DB`) |
| State is one in-memory object | one server | stateless workers reading per-user rows | routes are already thin |
| The app fetches its whole state when something changes | thousands of messages per person | paged history and per-chat deltas | the version check and the live nudge |
| Every open app is nudged on any change | thousands of connected apps | per-user channels on Redis pub/sub or a managed gateway | `listen()` and `poke()` in `lib/live.ts` |
| Model calls run inline | bursts of messages | a queue with workers, retries and a per-user budget | `askJson()` is the single choke point |
| Rate limits live in memory | one server | the same function over Redis | `allow()` in `lib/ratelimit.ts` |
| Files on local disk | one server | object storage with signed URLs | the access rule in `lib/files.ts` |
| Calls connect browser to browser | some networks block it | a TURN relay | the signalling in `lib/rtc.ts` |
| Hosted in one US region | latency from India (0.3 s per round trip) | a region in India | nothing else changes |

The data is naturally partitioned by user, which is what makes this path a migration and not a rewrite.

## Code layout

- `web/app/api/*/route.ts`: one folder per resource. Routes check sign-in, validate input, call `lib`, and return the caller's new state.
- `web/lib/`: logic, with no HTTP in it. Each file opens with a comment saying what it is for and what it must never do.
- `web/app/Messenger.tsx` (about 750 lines): the main screen's state, data loading and actions. Its parts live in `web/app/messenger/`: `ChatList`, `Conversation`, `Home`, `Sheets`, `SettingsMenu`, the two call overlays, the `useCalls` hook, and shared formatting. The split was mechanical: markup and logic were moved, not rewritten.
- `web/tests/unit/`: tests of pure functions, no server needed. `web/tests/*-test.mjs`: end-to-end suites against a running server.

## Known debts, named

- The assistant module is still called `butler.ts` and private notes are stored with `from: "butler"`, from the project's first name. The stored value is left alone so existing data keeps working.
- There is no schema validation library; inputs are checked by hand in each route.
- `web/app/Messenger.tsx` still owns about 45 pieces of state and passes them down as props. A reducer or small stores per area is the next step.
- End-to-end tests call the real model, so they are not run in CI.
