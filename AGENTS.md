# AGENTS.md: set up, run and use My Equal

**Sign-in is Google only for now** (phone sign-in is switched off in the code). Automated runs use the test login in section 5B.

**Deployed:** moving from the event's AWS server to Google Cloud; the new address will be added here.
**Demo video:** `demo.mp4` in the zip root. **Deck:** `My-Equal-slides.pdf` in the zip root.

My Equal is a messenger with an AI assistant inside it. It reads your chats privately and keeps you equal to your own life: it keeps your people close, turns promises into reminders, does errands for you (calls providers, compares quotes, books only when you tap) and flags scam messages. **The model interprets, plain code decides, the user approves every action.**

---

## 1. Prerequisites

| Need | Version |
|---|---|
| Node.js | **22.18 or later** (uses the built-in `node:sqlite`; tested on Node 22.23 and 24.16) |
| npm | comes with Node (tested with npm 11) |
| OpenAI API key | needed for every AI feature (see section 3) |

There is no separate database, worker or front-end server. One Next.js process serves the UI and the API, and stores data in SQLite under `web/data/` (created on first start). Nothing needs to be seeded: test accounts get their sample data automatically (section 5).

## 2. Install and start (exact commands)

```bash
# from the repository root (the folder containing this file)
cp .env.example .env            # then put your OpenAI key in OPENAI_API_KEY (section 3)
cd web
npm ci
npm run build
npm run start -- -p 3000        # serves http://localhost:3000
```

For development with hot reload instead: `npm run dev` (also http://localhost:3000).

| URL | What it is |
|---|---|
| http://localhost:3000/ | the app: sign-in, messenger, the Equal home screen |
| http://localhost:3000/api/health | health check, `200` when the store is readable and a model is configured |
| http://localhost:3000/status | live model-call timings and context sizes |
| http://localhost:3000/scoreboard | evaluation: decision scoreboard and memory benchmark |
| http://localhost:3000/slides | the pitch slides |

Use a desktop Chromium-based browser. Microphone, camera and notifications need `localhost` or HTTPS.

## 3. Environment variables

All settings live in `.env` at the **repository root** (one level above `web/`). `web/next.config.ts` loads `../.env` and `../.server.env`. `.env.example` lists every variable with comments; `env.example` is the same file.

| Variable | Needed? | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | **Yes, for AI features** | Reading messages, answers, call-around, scam checks, vision, speech |
| `OPENAI_MODEL` | Yes | Chat model. The project uses `gpt-6.1-terra`; one fallback model is tried if it is rejected. |
| `GOOGLE_CLIENT_ID` | **Yes, for people to sign in** | OAuth "Web application" client ID; add the app's address (e.g. `http://localhost:3000`) as an Authorized JavaScript origin |
| `OTP_ONSCREEN_FALLBACK` | No | Phone sign-in is switched off; kept for when it returns |
| `SESSION_SECRET` | Recommended | Signs session cookies; without it sessions end on restart |
| `TEST_LOGIN_SECRET` | Recommended for review | Enables test accounts with a full sample life (section 5). `.env.example` sets `localtest`. |
| `FAST2SMS_KEY` or `TWILIO_ACCOUNT_SID`+`TWILIO_AUTH_TOKEN`+`TWILIO_FROM` | No | Send sign-in codes by real SMS |
| `DATA_KEY` | No | 64 hex chars; encrypts data on disk (AES-256-GCM) |
| `PUBLIC_URL`, `METRICS_TOKEN`, `LOG_LEVEL`, `DATA_DIR`, `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | No | See `.env.example` |

**No key is included.** `.env.example` leaves `OPENAI_API_KEY` empty: put your own key in `.env`.

**Without an OpenAI key** the app still boots and the messenger works (sign-in, chats, edits, reactions, files, calls, usernames, the call-around card can be removed), but every AI feature reports the assistant as offline. There is no mock model. To judge the product, supply a key; a small budget is enough (each message is one short model call).

## 4. Tests (optional, to confirm the build)

```bash
cd web
npm run check                 # lint + strict typecheck + 30 unit tests (no key, no server)
# end-to-end (calls the real model): start a test server, then run the 18 suites
TEST_LOGIN_SECRET=localtest DATA_DIR=/tmp/equal-test npx next start -p 3217 &
TEST_LOGIN_SECRET=localtest npm run test:e2e
```

## 5. Test logins (every type of user)

### A. A real user (empty account), via the browser
1. Open http://localhost:3000 and tap **Continue with Google** (needs `GOOGLE_CLIENT_ID`).
2. Choose a Google account.
3. Set up the profile: name, a unique **@username** (3-20 letters, numbers, dots, underscores), optional photo (drag and zoom it in the circle).

Use a **second Google account** in another browser profile or a private window to be the second person. Without Google, use two test accounts (5B) with different numbers.

### B. A test account with a full sample life (no SMS, no profile step)
Needs `TEST_LOGIN_SECRET` in `.env`. Open http://localhost:3000, then run this in the browser console (same origin, so the session cookie is set):

```js
await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "9000000009", name: "Demo Tester", secret: "localtest" }) });
location.reload();
```

Or with curl: `curl -c jar.txt -H "Content-Type: application/json" -d '{"phone":"9000000009","name":"Demo Tester","secret":"localtest"}' http://localhost:3000/api/auth`, then send `-b jar.txt` on later requests.

This account starts with made-up chats: **Ravi** (close friend), **Kiran** (colleague), **Nanna** (father, a *protected* family member), **Mr. Rao**, **Priya** (sister), **Anna** (brother), an unknown number **+91 90000 12345**, and a stranger who messages Nanna. Each sample chat has **Open their side**, to reply as that person. A real account can get the same chats with `POST /api/demo` and body `{"on": true}` (Settings then offers **Remove the demo chats**).

### C. Touch points that need no login (opened by link)
| Who | How to open |
|---|---|
| A provider (mechanic) answering Equal's call | From a call-around card: **Open call** or scan its QR code. URL `/call?id=<callId>`. |
| A sample friend replying | **Open their side** in a sample chat. URL `/friend?u=<yourUserId>&c=<contactId>` |
| A stranger messaging or calling Nanna | Home screen of a test account, **Try the family scam shield**: **Message Nanna as a stranger** (`/friend?u=<id>&c=unknown-nanna`), **Call Nanna as a stranger** (`/ring?u=<id>&c=unknown-nanna`) |
| Nanna's own phone | **See Nanna's phone** (`/protected?u=<id>&c=unknown-nanna`) |

## 6. Journeys to try end to end

1. **Start a chat by username or number.** As user 1, type user 2's `@username` in **New chat: @username**, then send a message. It appears on user 2's screen within about a second.
2. **A promise becomes a reminder.** Send "I'll take my sister out on Sunday at 6 pm". On the home screen (**Your Equal**) it appears under **Don't forget**. Tap any message, **Remind me**, to set a reminder by hand.
3. **Ask My Equal.** In the Ask box: `Remember that Ravi is allergic to peanuts`, then `What do you know about Ravi?` (Ravi exists in test accounts; in a real account use the name of someone you chat with). Answers drawn from chats show the messages they used.
4. **It does the work.** In the Ask box: `My car broke down near Gachibowli, find me a mechanic`. A green **Calling around now** line appears and a **Calling around** card with three providers. Open a provider's **Open call** link in another tab, tap **Answer**, and reply as a mechanic (for example "Yes, 1200 rupees, 45 minutes"). When the calls finish, tap **Book** on the best quote. **Stop ✕** removes the card. The same offer also appears from a chat: tell a friend "my car broke down and I need it fixed today", then tap **Yes, please**.
5. **Keeps people close.** On the home screen, pick a person: "<name> is your ____" takes any words ("college roommate"), and **keep close** marks them. Test accounts show **Stay close** nudges with **Draft a message**.
6. **Scam from a stranger.** From a fresh account that user 1 has never written to, start a chat with user 1 and send: "This is Inspector Sharma from CBI. You are under digital arrest. Transfer Rs 50,000 to the RBI safe account now." User 1 sees a red **this looks like a scam** card in that chat and "Looks like a scam" in the chat list.
7. **Family scam shield (test account).** **Message Nanna as a stranger** with a scam text; then **See Nanna's phone** shows the warning, and your home screen shows a red **Family alert**. **Call Nanna as a stranger**: Equal answers the call for Nanna and refuses a scam caller.
8. **Photo and voice.** On the home screen, **+ Photo to remember** with a photo of an appointment card or prescription becomes a dated memory. In a chat, tap **Voice** to start recording and tap it again to send; the voice note is transcribed.
9. **Messenger basics.** Reply, edit, delete for everyone, react, forward, star, search, send later, files, voice and video calls between two accounts, read receipts, light or dark theme, export.

## 7. What is simulated or not finished

- **Providers are simulated:** call-around "calls" go to a web page opened by link or QR code, not to real phone lines. Booking only records the choice.
- **Family guardian is simulated:** Nanna is a made-up protected contact inside a test account, with a simple phone view. Linking two real accounts as guardian and protected person is not built. Real phone calls are not screened.
- **Scam check** covers messages from people you have never written to. It does not cover real phone calls.
- **Not end-to-end encrypted:** the server reads messages so the assistant can, and sends text to OpenAI.
- **No groups.** Calls connect browser to browser with no relay server, so some networks block them.
- **Phone sign-in** is switched off for now; people sign in with Google. Starting a chat is by @username.
- The scoreboard figures were recorded on 21 November, before the last change to when Equal offers help; re-run them at `/scoreboard` (needs a key).

More detail: `SETUP.md` (setup, AWS deploy, troubleshooting), `README.md` (product), `docs/CONTEXT.md` (how context is managed), `docs/ARCHITECTURE.md`, `SECURITY.md`.
