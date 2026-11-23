# My Equal

A messenger with your Equal inside it.

Everyone has so much on their plate that friends and family slip out of reach, and with every tool to stay in touch we still forget what we promised. My Equal makes sure that never happens. It is there in your conversations, so it knows your people, your promises and your responsibilities, and it keeps you equal to all three: never miss anything, never forget anything, never lose touch with anyone.

Built solo at **Builders 2026** (OpenAI x Equal AI, Hyderabad, 21-22 November 2026), in the **Build Creative** track: "Personal context, into everyday AI products".

**Live:** https://54-213-236-215.sslip.io
**Scoreboard:** https://54-213-236-215.sslip.io/scoreboard

## What it does

### The assistant: what makes it different

| | |
|---|---|
| **Remembers** | Picks up appointments, promises and worries from your chats, including WhatsApp chats you import. You can also tell it things directly: "Remember that Abhishek is allergic to peanuts". |
| **Reminds, and calls you** | Your own plans and promises become reminders. Tap any message and choose **Remind me**: it works out the time, and rings you ahead of it (three hours before a flight, fifteen minutes before a meeting) and says the reminder aloud. |
| **Answers** | Ask what you've forgotten, or "What do you know about Priya?". It answers from your own chats and notes and shows the message it relied on, or says it doesn't know. |
| **Keeps you close** | Learns who each person is to you and how often you usually talk, and tells you when that rhythm breaks and what to ask them about. |
| **Acts** | When you tell a friend your car broke down, it privately offers to help. Say yes and it calls three providers by voice, compares their quotes, and books only after you approve. |
| **Reads photos and voice** | A photo of a prescription, bill or appointment card becomes a dated memory. Voice notes are transcribed, with an English translation one tap away. |
| **Keeps your family safe** | Flags scam messages from unknown numbers, answers unknown callers on a family member's behalf and refuses scam calls, and alerts you either way. |

It decides when to speak and when to stay quiet, and shows its reason when it stays quiet. Nothing is sent or booked without the user's approval.

### The messenger: what people expect

Sign-in with Google (phone sign-in is built but switched off for now). One-to-one chat with reply, edit, delete for everyone, reactions, forward, starred messages and people, search across chats, photos and files, voice notes, send later, read receipts, unread counts, "online" and last seen, voice and video calls, export of your chats, notifications, a light and a dark theme, and it installs as an app from the browser.

## Try it

1. Open the live link on a phone or computer and continue with Google. A new account sets up its profile first: your name, and optionally a photo and a line about you.
2. Start a chat: type a friend's number or email in **New chat**. There is no list of who is here; you reach someone only by an address you already know. If they are not here yet, send them the invite.
3. Tell them something with a date in it ("demo at 2 tomorrow"). Open the home screen: it is under **Don't forget**.
4. Tap a message and choose **Remind me**, then **Need AI help**.
5. In the ask box, type `Remember that <name> is allergic to peanuts`, then ask `What do you know about <name>?`.

The call-around works in any chat: tell a friend `My car broke down near Gachibowli and I need it fixed today`, tap **Yes, please**, and open the home screen. Three call codes appear; scan one with a phone, tap **Answer**, and talk to it. When the calls finish, tap **Book**.

There is no demo data in the app. An account starts empty and holds only real conversations. (The automated tests' accounts carry a set of made-up chats, including a protected family member's phone, so that the scam shield and call screening can be tested end to end.)

## How it works

```
Browser ──> Next.js app (one server) ──> OpenAI
              │
              ├─ lib/butler.ts     reads each message: what to remember, whether to offer help
              ├─ lib/ask.ts        answers questions, and saves what the user tells it to remember
              ├─ lib/remind.ts     reminders the user asks for, and the reminder call
              ├─ lib/people.ts     who each person is to me, learned from the chat
              ├─ lib/calls.ts      call-around: opens the call, asks, compares quotes, books
              ├─ lib/voice.ts      speech in and speech out
              ├─ lib/scam.ts       scam check for unknown numbers, family alert
              ├─ lib/screen.ts     answers unknown callers for a family member
              ├─ lib/photo.ts      reads a photo into dated memories
              ├─ lib/deliver.ts    sending a message; lib/edit.ts editing, deleting, reacting
              ├─ lib/rtc.ts        voice and video calls (the server only introduces the two browsers)
              ├─ lib/live.ts       tells open apps the moment something changes
              ├─ lib/push.ts       notifications when the app is closed
              ├─ lib/scheduled.ts  send later
              ├─ lib/files.ts      photos and files
              ├─ lib/otp.ts        phone sign-in codes and SMS
              ├─ lib/store.ts      one private space per person; nudges computed in plain code
              ├─ lib/storage.ts    SQLite, one row per person, encrypted at rest
              └─ lib/evaluate.ts   the scoreboard
```

The rule throughout: **the model interprets, plain code holds state and rules, a person approves every action.**

- The model decides what a message means. Code decides who you are drifting from, which quote wins, when a reminder is due, and how long before a flight to ring.
- The first line of every call is fixed text, so the assistant always says it is an AI.
- Each person has a private space. A message to someone is delivered into their space, where their own assistant reads it for them. Neither side sees the other's memories, stars or offers.
- What Equal remembers from a message is tied to that message: edit or delete the message and the memory goes with it.

### How it keeps context small

The model never sees a whole chat history.

- For each new message it gets the last 12 messages of that chat and at most 40 known facts, ranked: anything sharing a word with the new message, then dated things nearest to today, then the newest.
- For a question it gets the memories that best fit the question (at most 80) and the best-matching messages (at most 45).
- Pings are not decided by the model. Reminders fire from dates; "stay close" compares the silence with how often you usually talk.

## Measured

| | |
|---|---|
| Code the browser downloads | 216 KB compressed |
| A message reaching the other person's open screen | about 0.3 s on the live site (0.09 s locally) |
| A check when nothing has changed | 36 bytes |
| Automated tests | 30 unit tests (no server needed) and 17 end-to-end suites |
| Memory accuracy | measured by a benchmark; results and every miss at `/scoreboard` |
| Model calls | timed and counted by purpose, live at `/status` |

## Engineering

Built in a weekend by one person, so it is not a finished enterprise system, and this section does not pretend it is. What it does have is the practices that make one possible, each backed by code you can open:

| Concern | What is there | Where |
|---|---|---|
| **Context** | The model reads a small ranked slice (12 messages, 40 facts), never a whole history. Facts are structured, carry the message they came from, and die with it. | [docs/CONTEXT.md](docs/CONTEXT.md), `web/lib/butler.ts` |
| **Observability** | Health check, metrics with percentiles, one structured log line per model call (no message text), and a live status page. | `/status`, `/api/health`, `/api/metrics`, `web/lib/metrics.ts`, `web/lib/log.ts` |
| **Security and privacy** | No user directory, private spaces, data encrypted at rest (AES-256-GCM), hashed one-time codes that never reach the browser, signed cookies, rate limits, safe file serving, security headers. A separate read-only review by an AI reviewer was run, and its findings were fixed or written down. | [SECURITY.md](SECURITY.md) |
| **Storage** | SQLite, one row per person, only changed rows written, each save one transaction. | `web/lib/storage.ts` |
| **Reliability** | Model calls time out, a failed model call never blocks a message, saves are transactional, unreadable data is never overwritten, failures are logged and not swallowed. | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **Scale** | One process with an embedded database today. The data is partitioned by user, and each limit has a named replacement. | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **Evaluation** | A decision scoreboard (60 messages) and a memory benchmark (recall, dates, noise, answers, honesty), both run through the app's own code with the real model. | `/scoreboard`, `web/lib/evaluate.ts`, `web/lib/memory-eval.ts` |
| **Quality gates** | Lint, strict type-check, unit tests and a production build run in CI on every push. | `.github/workflows/ci.yml`, `npm run check` |

The known debts are named in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the main screen still passes a lot of state down as props, inputs are validated by hand, and the end-to-end tests call the real model so they run by hand, not in CI.

## What is real and what is not

- **Real:** phone sign-in, person-to-person chat and everything in "The messenger" above, WhatsApp import, the reading of messages, reminders, the voice conversation with providers, the comparison, the scam check.
- **Sign-in codes:** sent by SMS. If a text cannot be sent, sign-in is refused; a code is never shown on screen unless the demo switch `OTP_ONSCREEN_FALLBACK=on` is set.
- **Simulated:** the providers. A call goes to a web page opened by link or QR code, not to a phone line. In a demo, people in the room play the mechanics.
- **Simulated:** the protected family member ("Nanna") is a simple phone view, not a second account, and call screening happens inside the app. It does not intercept real phone calls.
- **No demo data:** an account starts empty. Made-up chats exist only in the automated tests' accounts.

## Scoreboard

Sixty hand-written messages in English, Hindi and Telugu are run through the same code the app uses.

| Measure | Result (21 Nov 2026) |
|---|---|
| Offered help when it should | 20 of 20 |
| Stayed quiet when it should | 20 of 20 |
| Scams caught | 10 of 10 |
| Genuine messages left alone | 10 of 10 |

This is a small set written by the builder, and the messages are clear-cut, so a perfect score says the set is easy more than it says the assistant is flawless. Fourteen of the sixty were also used during development; on the other forty-six it scored 46 of 46. The messages are in `web/eval/cases.json` and every miss is listed on the scoreboard page.

## Limits

Stated plainly, because a messenger asks for trust.

- **Not end-to-end encrypted.** Data is encrypted in transit and at rest, but the server can read messages, because the assistant reads them there with an AI model (OpenAI). The sign-in screen says so. A server-side assistant and end-to-end encryption cannot both be true; reading on the device is the way to have both, and it is not built.
- **One server, with an embedded database.** Fine for hundreds of people, not for a launch. When something changes, the app still fetches its whole state.
- **Calls have no relay server.** They connect browser to browser, and can fail between some networks.
- **Notifications** need the browser's permission, and on an iPhone the app must first be added to the Home Screen. A reminder call rings only while the app is open; when it is closed you get a notification instead.
- **No groups**, and no caller ID for real phone calls: that needs a native Android app.
- **Files** are kept on the server's own disk.
- **Not yet tried on real devices:** calls across different networks, notification delivery, and texting an invite.

## Run it locally

Needs Node 22 or later.

```bash
cd web
npm install
```

Copy `env.example` to `.env` in the repository root (one level above `web`) and fill it in. The minimum is:

```
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-6.1-terra
```

Optional lines:

```
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com   # adds "Continue with Google" as a second way in
FAST2SMS_KEY=your-key                                 # sends sign-in codes by SMS (India)
TWILIO_ACCOUNT_SID=...                                # or Twilio: these three together
TWILIO_AUTH_TOKEN=...
TWILIO_FROM=+1...
OTP_ONSCREEN_FALLBACK=on                              # demo only: show the sign-in code on screen when it cannot be texted
DATA_KEY=<64 hex characters>                          # seals the data on disk; a server makes its own
PUBLIC_URL=https://your-address                       # used in invitation texts
METRICS_TOKEN=...                                     # lets a scraper read /api/metrics
LOG_LEVEL=silent                                      # turns the JSON log lines off
```

```bash
npm run dev
```

## Tests and checks

```bash
cd web
npm run check        # lint, strict type-check, and the unit tests
npm test             # 30 unit tests of pure logic: no server, no network, no model
```

End-to-end suites drive the real app over HTTP, with two or three accounts talking to each other. They need a running server and call the real model:

```bash
TEST_LOGIN_SECRET=localtest SESSION_SECRET=local npx next start -p 3217
```

```bash
TEST_LOGIN_SECRET=localtest npm run test:e2e
```

The seventeen suites in `web/tests/`: `multiuser`, `messages`, `more`, `files`, `live`, `product`, `phone`, `profile`, `people`, `import`, `memory`, `extras`, `call`, `callaround`, `voice`, `scam`, `protect`. None of them sends an SMS: the phone suite skips every step that would text a number when an SMS service is connected.

CI (`.github/workflows/ci.yml`) runs lint, type-check, unit tests and the build. It does not run the end-to-end suites, because they need a model key.

## Deploying

One Ubuntu server on AWS, with Caddy providing HTTPS (the microphone, camera and notifications need it). `deploy/setup-server.sh` prepares a fresh server once; `deploy/push.sh` sends the code, builds it there and restarts the app. Only the OpenAI, Google and SMS lines of `.env` are kept on the server.

## Repository

- `web/` the app
- `deploy/` server setup and deploy scripts
- `docs/` how context is managed, and the architecture with its limits
- `SECURITY.md` what protects people's data, and what does not yet
