# My Equal

A messenger with a second you inside it. My Equal knows what is happening in your life because it is there in your conversations, and it has one job: make sure you never miss anything, never forget anything, and never lose touch with anyone.

Built solo at **Builders 2026** (OpenAI x Equal AI, Hyderabad, 21-22 November 2026), in the **Build Creative** track: "Personal context, into everyday AI products".

**Live:** https://54-213-236-215.sslip.io
**Scoreboard:** https://54-213-236-215.sslip.io/scoreboard

## What it does

| | |
|---|---|
| **Remembers** | Picks up appointments, promises and worries from your chats, including WhatsApp chats you import. |
| **Acts** | When you tell a friend your car broke down, it privately offers to help. Say yes and it calls three providers by voice, compares their quotes, and books only after you approve. |
| **Keeps you close** | Tells you when you have not spoken to someone in weeks, and what to ask them about. |
| **Reminds** | Your own plans and promises ("I'll send the deck by Friday") become reminders with a day and time. |
| **Answers** | Ask it anything you've forgotten. It answers from your own chats and shows the message it relied on, or says it doesn't know. |
| **Knows your people** | Works out who each person is to you from the chat, and how often you usually talk, and notices when that rhythm breaks. You can correct it. |
| **Reads photos** | Photograph a prescription, bill or appointment card and it becomes a dated memory. The photo itself is not kept. |
| **Takes voice notes** | Speak instead of typing. The note is transcribed, and translated to English for the reader when it's in another language. |
| **Keeps your family safe** | Flags scam messages from unknown numbers, answers unknown callers on a family member's behalf and refuses scam calls, and alerts you either way. |

It decides when to speak and when to stay quiet, and shows its reason when it stays quiet. Nothing is sent or booked without the user's approval.

## Try it

1. Open the live link and sign in with Google.
2. In the sample chat with **Ravi**, send: `My car broke down near Gachibowli and I need it fixed today`.
3. A private note offers help. Tap **Yes, please**.
4. Open the **Equal** tab. Three call codes appear. Scan one with a phone, tap **Answer**, and talk to it.
5. When the calls finish, a comparison appears with a pick. Tap **Book**.
6. For the scam shield, use the two links at the bottom of the Equal tab: message Nanna as a stranger, and watch Nanna's phone.

Anyone else who signs in appears under **People here**, and you can chat with them for real.

## How it works

```
Browser ──> Next.js app (one server) ──> OpenAI
              │
              ├─ lib/butler.ts    reads each message: what to remember, whether to offer help
              ├─ lib/calls.ts     call-around: opens the call, asks, compares quotes, books
              ├─ lib/voice.ts     speech in and speech out for calls
              ├─ lib/scam.ts      scam check for unknown numbers, family alert
              ├─ lib/screen.ts    answers unknown callers for a family member
              ├─ lib/people.ts    who each person is to me, learned from the chat
              ├─ lib/ask.ts       answers questions from memories and messages
              ├─ lib/photo.ts     reads a photo into dated memories
              ├─ lib/store.ts     one private space per person; nudges computed in plain code
              ├─ lib/auth.ts      Google sign-in, signed session cookie
              └─ lib/evaluate.ts  the scoreboard
```

The rule throughout: **the model interprets, plain code holds state and rules, a person approves every action.**

- The model decides what a message means. Code decides who you are drifting from, which quote wins, and when a follow-up is due.
- The first line of every call is fixed text, so the assistant always says it is an AI calling for a customer.
- Each signed-in person has a private space. A message to a real person is delivered into their space, where their own assistant reads it for them. Neither side sees the other's memories or offers.
- Pages opened by link (a provider's call, the other side of a sample chat, the protected family phone) expose only what that link is for.

## What is real and what is simulated

- **Real:** Google sign-in, person-to-person chat, WhatsApp import, the reading of messages, the voice conversation, the comparison, the scam check.
- **Simulated:** the providers. A call goes to a web page opened by link or QR code, not to a phone line. In a demo, people in the room play the mechanics.
- **Simulated:** the protected family member ("Nanna") is a simple phone view, not a second account.
- **Simulated:** call screening happens inside the app. A caller opens a link and Equal answers; it does not intercept real phone calls.
- **Sample data:** each new account starts with sample contacts, tagged "sample" in the app.

## Scoreboard

Sixty hand-written messages in English, Hindi and Telugu are run through the same code the app uses.

| Measure | Result (21 Nov 2026) |
|---|---|
| Offered help when it should | 20 of 20 |
| Stayed quiet when it should | 20 of 20 |
| Scams caught | 10 of 10 |
| Genuine messages left alone | 10 of 10 |

This is a small set written by the builder, and the messages are clear-cut, so a perfect score says the set is easy more than it says the assistant is flawless. Fourteen of the sixty were also used during development; on the other forty-six it scored 46 of 46. The messages are in `web/eval/cases.json` and every miss is listed on the scoreboard page.

## Run it locally

Needs Node 22 or later.

```bash
cd web
npm install
```

Create a file named `.env` in the repository root (one level above `web`):

```
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-6.1-terra
GOOGLE_CLIENT_ID=your-id.apps.googleusercontent.com
```

```bash
npm run dev
```

For Google sign-in, the OAuth client must list your address (for example `http://localhost:3000`) under Authorized JavaScript origins.

## Tests

End-to-end tests run against a running server and sign in through a test-only login guarded by `TEST_LOGIN_SECRET`.

```bash
TEST_LOGIN_SECRET=localtest SESSION_SECRET=local npx next start -p 3217
```

```bash
node tests/multiuser-test.mjs http://localhost:3217
```

The other suites are `callaround-test.mjs`, `scam-test.mjs`, `voice-test.mjs`, `memory-test.mjs`, `protect-test.mjs` and `extras-test.mjs`.

## Deploying

One Ubuntu server on AWS, with Caddy providing HTTPS (the microphone needs it). `deploy/setup-server.sh` prepares a fresh server once; `deploy/push.sh` sends the code, builds it there and restarts the app. Data is one file on that server, which suits a demo and not production.

## Limits

- One server and one data file. It is safe for many people at once, but it is not built to scale.
- Voice is turn-based (tap, speak, tap), with a few seconds per turn. It is not a continuous live call.
- Anyone with a Google account can sign in, and signed-in people can see each other's names and photos.
- Messages are read by an AI model (OpenAI). The sign-in screen says so.

## Repository

- `web/` the app
- `deploy/` server setup and deploy scripts
- `BUILD-PLAN.md` the plan the build followed
- `research-findings.md` the research done before the event: complaints, sources and scored ideas
