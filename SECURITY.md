# Security and privacy

What protects people's data here, what was reviewed, and what is not yet safe enough for a real launch. A messenger asks for trust, so the gaps are listed as plainly as the protections.

## What is in place

**Who can see what**
- There is **no directory**. Nobody can browse who is on Equal. A chat starts only from a phone number or email the person already knows, and lookups are limited to 30 an hour per account (`web/app/api/chats/route.ts`).
- Each person has a **private space**. Every signed-in route works only on the caller's own space (`context()` in `web/lib/auth.ts`). Memories, stars, reminders and Equal's notes are never sent to the other side of a chat.
- "Online" and "last seen" are shown only for people who have **written back** to you (`web/lib/snapshot.ts`).
- Before a sign-in code is proved, the server does not say whether a number already has an account.

**Sign-in and sessions**
- One-time codes are stored only as a salted hash, in memory, for five minutes, with five tries, and are used once (`web/lib/otp.ts`).
- **A code is never sent to the browser.** If a text cannot be sent, sign-in is refused. (A demo switch, `OTP_ONSCREEN_FALLBACK=on`, shows the code on screen for a server with no SMS service; it is off by default and `/api/health` reports when it is on.)
- The session is a signed cookie: HMAC-SHA256, compared in constant time, `HttpOnly`, `SameSite=Lax`, `Secure` in production (`web/lib/auth.ts`).
- Google sign-in checks the token's audience and that the email is verified.
- The automated tests' login needs a server-side secret and can never sign in as a real account.

**Abuse and cost**
- Rate limits on the things that cost money or reveal information: code requests and tries per network address, lookups, questions to the assistant, imports, invitations, and the link-opened demo pages (`web/lib/ratelimit.ts`).
- One message can add at most four facts to memory.
- Model calls are abandoned after 45 seconds.

**Files**
- A file is served only to someone who holds a message carrying it. Only PNG, JPEG, GIF and WebP are shown in place; everything else is a download served as plain bytes with `nosniff`, so an uploaded HTML or SVG file cannot run as a page (`web/lib/files.ts`, `web/app/api/files/route.ts`). File ids are validated, so a path cannot be smuggled in.

**The assistant**
- It has no tools. Its output is structured JSON: facts, resolutions, and speak-or-stay-quiet. It cannot send, delete, book or pay.
- Booking needs the user's tap. Drafts only fill the message box. Every call the assistant makes opens with fixed text saying it is an AI.

**Data at rest**
- Chats, facts and uploaded files are sealed with **AES-256-GCM** before they are written to disk, with a fresh nonce per write (`web/lib/storage.ts`). The key is generated on the server, kept in a file only its service user can read, and never leaves it. A copy of the disk without the key is unreadable; the unit tests check that no message text or name appears in the stored bytes.
- If the key is missing or wrong, the app refuses to start empty on top of the data.

**Transport, headers, secrets, logs**
- HTTPS everywhere (Caddy). `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy` on every response (`web/next.config.ts`).
- Keys live in `.env`, which is ignored by git. Only the lines the app needs are kept on the server, in a file readable by one user. The server generates its own session secret.
- Ids for accounts, calls and files come from the system's secure random source.
- Logs carry ids, durations and outcomes. **Message text, names and phone numbers are never logged** (`web/lib/log.ts`).
- The service worker never caches anything under `/api/`.

## What was reviewed

A separate read-only review of every route and library file was run on 22 November 2026 by an AI reviewer working from the code alone (not a human penetration test), covering authorization, the sign-in flow, file handling, link-opened pages, headers, id generation, prompt injection, logging and the deploy scripts. Its findings that could be fixed safely the same day were fixed: the public list of users, the "is this number known" answer, missing rate limits, the test login reaching real accounts, predictable ids, missing headers, presence shown before a reply, unbounded facts per message, sign-in codes reaching the browser, and data stored in the clear.

## Known limits

These are real. None is hidden behind wording.

1. **Not end-to-end encrypted, by design of the feature.** Data is encrypted in transit and at rest, but the server can read messages, because the assistant reads them there and their text is sent to OpenAI. The sign-in screen says so. End-to-end encryption and a server-side assistant cannot both be true; the way to have both is to run the reading on the person's own device, or in a private deployment the provider cannot see into. That is the main item on the roadmap, and it is not built.
2. **Sign-in depends on one SMS service.** Codes go by SMS and sign-in is refused when a text cannot be sent, so an outage or empty credit at the SMS service stops phone sign-in (Google sign-in still works).
3. **The encryption key sits on the same server as the data.** It protects a stolen disk or backup, not a break-in to the running server. A managed key service is the next step. Files and data are on one server's disk.
4. **Sessions cannot be revoked** and last a week. Signing out clears the cookie on that device only.
5. **Prompt injection.** A contact can write a message crafted to make the assistant store a misleading note. It cannot make the assistant act. Every stored fact names the message it came from and can be deleted, and edits and deletes remove their facts. It has not been red-teamed.
6. **Link-opened demo pages** (a mechanic's call page, the "other side" of a demo chat) need no sign-in and are addressed by an account id in the link. They can read only demo threads, and are rate-limited, but the links are not signed.
7. **Membership can be probed** one address at a time, within the lookup limit: starting a chat with a number says whether it is on Equal. Messengers that find contacts by phone number share this property.
8. **Calls connect browser to browser**, so each side can learn the other's network address.
9. **No content security policy yet**, no upload quota, and request bodies are not capped at the proxy.
10. **Rate limits are in memory** and per process.

## Reporting a problem

This was built at a hackathon by one person. Open an issue on the repository, without including anyone's personal data.
