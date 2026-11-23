# Setup: My Equal

How to install, configure, run, test and deploy My Equal, and how to try the main demo flow.

Each step is marked:

- **Verified**: run and checked on 22 November 2026, against this repository (commit `bfe3fd2`) or the live server.
- **Unverified**: written from the code and scripts, but not run end to end during that check.

Sign-in is **Google only for now**; phone sign-in is switched off in the code. The app is moving from the event's AWS server to Google Cloud.

**Quick start (fresh machine, Node 22.18+):**

```bash
cp .env.example .env      # at the repository root; put your OpenAI key in OPENAI_API_KEY
cd web && npm ci && npm run build && npm run start -- -p 3000
# open http://localhost:3000 and tap "Continue with Google" (needs GOOGLE_CLIENT_ID in .env)
```

`AGENTS.md` at the root has the same instructions plus every test login and journey, written for an agent to follow.

---

## 1. What runs

One Next.js app (`web/`) served by one Node process. Data is kept in SQLite (Node's built-in `node:sqlite`) in `web/data/`, encrypted at rest when `DATA_KEY` is set. In production, Caddy sits in front of it and provides HTTPS. The app calls OpenAI for reading messages, vision and speech.

```
Browser ──HTTPS──> Caddy (:443) ──> Next.js app (:3000) ──> OpenAI
                                          │
                                          └─ web/data/equal.db (SQLite), web/data/files, web/data/avatars
```

---

## 2. Prerequisites

| Need | Version / note | Status |
|---|---|---|
| Node.js | 22.18 or later (`web/package.json` → `engines`). The app uses the built-in `node:sqlite` module. | Verified on Node 24.16 (laptop) and Node 22.23 (server) |
| npm | Comes with Node | Verified (npm 11.13) |
| Git | To clone the repository | Verified |
| OpenAI API key | Required for everything the assistant does | Verified (in use on the live server) |
| SMS service (optional) | Fast2SMS (India) or Twilio, to text sign-in codes | **Unverified** in this check |
| AWS account (for deploying) | One Ubuntu 24.04 EC2 instance | See section 6 |

---

## 3. Environment variables

Settings are read from `.env` and `.server.env` in the **repository root** (one folder above `web/`). `web/next.config.ts` loads both at startup. Values already set in the real environment take precedence. A template with comments is in `.env.example` (identical copy: `env.example`): copy it to `.env` and fill it in. It is already set up for review: sign-in codes shown on screen (`OTP_ONSCREEN_FALLBACK=on`) and test accounts enabled (`TEST_LOGIN_SECRET=localtest`). **Never commit `.env`.**

**Without an OpenAI key** the app boots and the messenger works, but every AI feature reports the assistant as offline. There is no mock model, so supply a key to try the product; a small budget is enough.

Names only, no values:

### Required

| Name | What it is for |
|---|---|
| `OPENAI_API_KEY` | All model calls: reading messages, answers, call-around, scam checks, vision, speech |
| `OPENAI_MODEL` | The chat model name (the project uses `gpt-6.1-terra`; one fallback model is tried if this one is rejected) |

### Sign-in by SMS (optional; set one service)

| Name | What it is for |
|---|---|
| `FAST2SMS_KEY` | Send sign-in codes through Fast2SMS (India) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Or send them through Twilio (all three together) |
| `OTP_ONSCREEN_FALLBACK` | `on`: when a text cannot be sent, show the code on screen (demo only). `off`: refuse sign-in. |

Phone sign-in is switched off in the code for now, so these SMS settings have no effect until it returns.

### Operating it (optional)

| Name | What it is for |
|---|---|
| `PUBLIC_URL` | The public address, used in invitation texts and notifications |
| `METRICS_TOKEN` | Lets a scraper read `/api/metrics` with `Authorization: Bearer <token>` |
| `LOG_LEVEL` | `silent` turns the JSON log lines off |
| `DATA_DIR` | Where data is stored (default `web/data`) |
| `OPENAI_STT_MODEL`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE` | Override the speech-to-text and text-to-speech models and the voice |
| `APP_VERSION` | Version string shown by `/api/health` |
| `GOOGLE_CLIENT_ID` | **Required for sign-in.** OAuth "Web application" client ID; add each address the app runs on as an Authorized JavaScript origin |

### Secrets the server makes for itself

`deploy/on-server.sh` writes these once to `/opt/butler/.server.env`. Do not set them by hand on a server. Locally you may put them in `.env`.

| Name | What it is for |
|---|---|
| `SESSION_SECRET` | Signs the session cookie. Without it, sessions last only until the process restarts. |
| `DATA_KEY` | 64 hex characters; seals the data on disk with AES-256-GCM. **Lose it and the data cannot be read.** |
| `TEST_LOGIN_SECRET` | Lets the automated tests sign in as test accounts. Must match between the server and the test run. |

---

## 4. Install and run locally

```bash
git clone https://github.com/AgentHaresh/my-equal.git
cd my-equal
cp .env.example .env         # then fill in OPENAI_API_KEY (OPENAI_MODEL is preset)
cd web
npm ci                       # or: npm install
```

| Command (from `web/`) | What it does | Status |
|---|---|---|
| `npm run build` | Production build | Verified (succeeds) |
| `npm run start -- -p 3000` | Run the production build on http://localhost:3000 | Verified (port 3217 in the test runs) |
| `npm run dev` | Development server on http://localhost:3000 | **Unverified** in this check |

Then open the app in a browser. The microphone, camera and notifications need HTTPS, or `localhost`.

---

## 5. Test

All commands run from `web/`.

| Command | What it does | Status |
|---|---|---|
| `npm test` | 30 unit tests of pure logic. No server, network or model needed. | Verified: 30 passed, 0 failed |
| `npm run lint` | ESLint | Verified (clean) |
| `npm run typecheck` | Strict TypeScript check | Verified (clean) |
| `npm run check` | The three above together | Its parts verified separately |
| End-to-end suites (below) | Drive the real app over HTTP with two or three accounts. They **call the real OpenAI model**, so they need a key and cost a little. | Verified: all 18 suites passed |

End-to-end, in two terminals:

```bash
# terminal 1: a server for the tests, with its own data folder
TEST_LOGIN_SECRET=localtest DATA_DIR=/tmp/equal-test-data npx next start -p 3217

# terminal 2
TEST_LOGIN_SECRET=localtest npm run test:e2e        # all suites; or: node tests/<name>-test.mjs http://localhost:3217
```

The 18 suites in `web/tests/` are: `call`, `callaround`, `extras`, `files`, `import`, `live`, `memory`, `messages`, `more`, `multiuser`, `people`, `product`, `profile`, `protect`, `scam`, `signin`, `stranger`, `voice`. None of them sends a real SMS.

CI (`.github/workflows/ci.yml`, Node 24) runs `npm ci`, lint, typecheck, unit tests and the build on every push. Verified: the last three runs on `main` passed. CI does not run the end-to-end suites, because they need a model key.

---

## 6. Deploy on AWS

The live app runs on one EC2 instance in `us-west-2`, verified as Ubuntu 24.04.5 LTS with 2 vCPUs, about 2 GB RAM and Caddy 2.11. From outside, ports 22, 80 (redirects to HTTPS) and 443 are open, and the app's own port 3000 is not reachable.

### 6.1 Create the server: **unverified**

The repository has no script or record of how the instance was created, so this step is written from what the server shows today:

1. Launch an EC2 instance with Ubuntu 24.04 (2 vCPU / 2 GB RAM or more) and a key pair. Keep the `.pem` file private and out of git.
2. In its security group, allow inbound TCP **22** (SSH, ideally from your own IP only), **80** and **443** (anyone).
3. Note its public IP. For HTTPS without buying a domain, the hostname `<ip-with-dashes>.sslip.io` resolves to that IP, for example `54-213-236-215.sslip.io`.

For a temporary AWS workshop account, `deploy/save-aws-login.py` saves copied CLI credentials to your AWS login file without printing them (region `us-west-2`). **Unverified** in this check.

### 6.2 Prepare the server once: **unverified** (not re-run on a fresh server)

Copy `deploy/setup-server.sh` to the server and run:

```bash
sudo bash setup-server.sh <public-hostname>        # e.g. 54-213-236-215.sslip.io
```

It installs Node 22 and Caddy, writes a Caddyfile that proxies `<hostname>` to `localhost:3000` with automatic HTTPS, and registers the app as the systemd service `butler` (working directory `/opt/butler/web`). The live server matches this layout (verified: the Caddyfile and the `butler` service are as described).

### 6.3 Deploy the code: **verified**

From the laptop, at the repository root, with `.env` filled in:

```bash
bash deploy/push.sh <server-ip> <path-to-key.pem>
```

This:

1. packs `web/`, leaving out `node_modules`, `.next` and `data`
2. uploads it with `.env`
3. on the server (`deploy/on-server.sh`):
   - keeps only the app's setting lines from `.env`
   - creates `SESSION_SECRET`, `TEST_LOGIN_SECRET` and `DATA_KEY` once in `.server.env`
   - runs `npm ci` and `npm run build`
   - restarts `butler`

The script prints `app on server: 200` when the app answers. The script was run successfully for the three deploys of 22 November 2026.

On the Windows laptop used for this project the SSH step sometimes stayed open after the server had finished. If that happens, check the site itself rather than waiting on the script.

Data on the server lives in `/opt/butler/web/data/`. Back it up together with `/opt/butler/.server.env`: without that file's `DATA_KEY`, the data cannot be read.

### 6.4 Check it is up: **verified**

```bash
curl https://<hostname>/api/health        # 200 when the store is readable and a model is configured
```

Also: `/status` (live model call timings) and `/scoreboard` (evaluation results).

---

## 7. Test logins

| User type | How to sign in |
|---|---|
| Real user (starts empty) | Open http://localhost:3000, tap **Continue with Google**, then set a name and a unique @username. A new account can tap **Try it with sample chats**. Use a second Google account in a private window as the second person. |
| Test user with a full sample life | In the browser console on http://localhost:3000: `await fetch("/api/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:"9000000009",name:"Demo Tester",secret:"localtest"})}); location.reload();` It starts with made-up chats (Ravi, Kiran, Priya, Anna, Nanna as a protected father, and a scam number) and links to try the family scam shield. |
| Provider (mechanic) | No login: open **Open call** (or scan the QR code) on a call-around card. |
| A sample friend, a stranger, Nanna's phone | No login: the **Open their side** link in a sample chat, and the **Try the family scam shield** links on a test user's home screen. |

## 8. Try the main demo flow

Accounts start empty: there are no demo chats in a real account. The flow needs **two people** (two phones, or two browsers with one in a private window), each with a phone number that can receive the sign-in code. If no SMS service is set up, the server must have `OTP_ONSCREEN_FALLBACK=on` so the code is shown on screen.

| Step | What to do | What you should see | Status |
|---|---|---|---|
| 1. Sign in | Open the app, tap **Continue with Google** | The profile screen | Google-only behaviour verified by the `signin` suite; the Google button itself **unverified** in this check |
| 2. Set up a profile | Name, a unique **@username** (suggested from your name), an optional photo: drag and zoom it in the circle | The home screen, "Your Equal is listening" | Username rules verified by the `multiuser` suite; photo placing **unverified on a real phone** |
| 3. Start a chat | In **New chat**, type the other person's `@username` | The chat opens on both sides | Verified (`multiuser` suite) |
| 4. A promise becomes a reminder | Send "I'll take my sister out on Sunday at 6" | It appears on the home screen under **Don't forget** | Covered by the `memory` and `product` suites |
| 5. Ask My Equal | In the Ask box: `Remember that <name> is allergic to peanuts`, then `What do you know about <name>?` | A saved note, then an answer with its source | Covered by the `memory` suite |
| 6. Who someone is | On the home screen, pick the person and fill in "<name> is your ____" in your own words | Saved; the AI does not overwrite it | Covered by the `memory` suite (server side) |
| 7. It does the work | In the Ask box: `My car broke down near Gachibowli, find me a mechanic`. Or tell a friend in a chat and tap **Yes, please**. | A green "Calling around now" line, and a **Calling around** card with three providers | Verified (`stranger` and `callaround` suites) |
| 8. Play a mechanic | On another phone, scan a provider's QR code or tap **Open call**, tap **Answer**, and reply by voice or text | The quote appears on the card. When calls finish, tap **Book**. **Stop ✕** removes the card. | Verified by the suites; voice on real devices **unverified** |
| 9. Scam check | From a second account that has never been written to, send a scam text (for example, a fake "CBI digital arrest" demand for money) | A red "this looks like a scam" warning in the chat and a notification | Verified (`stranger` suite); the notification on a real device is **unverified** |

What is simulated (see also the README): the mechanics answer through a web page opened by link or QR code, not a phone line. The protected family member's phone and call screening exist only in the test accounts' made-up chats. Messages are not end-to-end encrypted.

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| `/api/health` returns 503 | No `OPENAI_API_KEY` / `OPENAI_MODEL`, or the data cannot be read (wrong or missing `DATA_KEY`) |
| The Google button does not appear or errors | `GOOGLE_CLIENT_ID` missing, or the app's address is not an Authorized JavaScript origin on that client |
| Everyone is signed out after a restart | `SESSION_SECRET` is not set (the server sets it in `.server.env`; locally add it to `.env`) |
| End-to-end tests fail at sign-in | `TEST_LOGIN_SECRET` differs between the server and the test run |
| Microphone, camera or notifications do nothing | The page is not on HTTPS (or `localhost`); on iPhone, add the app to the Home Screen first |
