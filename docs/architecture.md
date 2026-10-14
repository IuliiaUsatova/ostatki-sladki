# Full-stack architecture

## Decision

Use one Next.js application for React screens and a Node HTTP API. The previous Vite implementation was still a foundation with placeholder pages and client-only test auth, so the migration did not have to replace a working backend. Preserve it under `legacy/vite` for reference.

The UI owns transient interaction state. The server owns identity scope, mailbox confirmation, email capabilities, price, stock, expiry, order transitions, handoff and support assignment/decisions. A language provider owns only the interface preference; it cannot grant permissions.

The repository is SQLite-specific. The marketplace service owns rules and calls repository operations inside transactions. Route handlers translate HTTP/session input and domain failures; they do not contain business rules. Shared DTOs describe values across this boundary, while runtime validation checks untrusted request values.

## Request path

Buyer chooses quantity → client preserves one attempt key and payload → POST reservation → same-origin/body validation → server session → buyer/verified-email/offer/quantity validation → SQLite transaction → expired holds stop consuming stock → capacity check → immutable order snapshot + event + idempotency record → response → order screen.

A lost response retains that original quantity/key, including after reload. The buyer cannot change quantity until the same attempt returns a known result. If browser storage is unavailable, checkout fails before sending the mutation.

Reservation confirmation changes Reserved to Confirmed and issues a pickup code. Payment is due at pickup; confirmation does not claim a payment-provider charge. Staff lookup does not collect an order. Physical handoff confirmation checks venue, role, shift, code, state and immutable pickup window before recording Collected. Retrying the same attempt returns the existing result.

## Data and time

Database path: `data/ostatki.sqlite`, excluded from Git. Database files are private to the local user; session and email capability tokens are hashed at rest. Credential revision and confirmation state live in `auth_state`; one-time capabilities and mail cooldowns live in separate SQLite tables. Schema creation and migrations are idempotent. New production databases start empty; development/test startup enables fictional fixtures; production and unconfigured standalone startup do not. Tests use isolated temporary/in-memory databases.

Instants are stored as ISO UTC strings. The service clock is injectable for boundary tests; browsers display venue time in `Asia/Almaty`. Holds last five minutes. Buyer cancellation of a confirmed booking closes exactly at pickup start; café cancellation closes at the original pickup end. Pickup is valid from start inclusive to end exclusive. An unpaid hold may be released before expiry even after pickup starts. Collected units remain consumed inventory.

Seed windows and shifts are fixed at first database creation. Explicit offer edits affect new reservations only. Existing orders retain their own snapshot. At the original pickup end, still-confirmed bookings become `not_collected` without blaming the buyer; their quantities remain committed. Café cancellation pauses the source offer atomically and blocks confirmation of its existing holds, while preserving other confirmed bookings. Auth email submission runs during the initiating request. Order notifications, reminder schedules and email jobs commit atomically with order transitions; a dedicated supervised Node worker finalizes overdue bookings, checks reminders and sends mail every 15 seconds, without requiring page visits. Payment webhooks are not implemented. See [order completion and conversations](order-lifecycle.md).

## Email lifecycle

`AuthLifecycle` owns verification/recovery policy, capability creation and transactional consumption. `AuthMailer` is the injected delivery boundary; `createAuthMailer` loads private settings and submits localized messages to Brevo. Tests replace the transport without sending real email.

Registration saves the account/session, then attempts a confirmation email. Provider failure returns a saved account with `verificationEmailSent: false`. Mailbox confirmation requires an existing login for the same account, followed by explicit POST of the token. Reset is a mailbox capability flow without a login requirement. Both increment credential revision, remove other outstanding capabilities and revoke all account sessions. Reset also confirms the mailbox. The UI then offers sign-in instead of automatic authentication.

The token and language enter the client via a URL fragment. The client reads it once and removes it from the address bar, keeping it only in component memory. A reload requires reopening the email link. Verification lasts 24 hours and recovery 30 minutes. Auth-mail submission has a recipient/purpose cooldown; configured recovery gives a generic acknowledgement for unknown accounts or delivery failure. These security email requests have no persistent queue, so submission failure requires another explicit request. Order email uses a separate durable outbox and background retry worker; see [order notifications](order-notifications.md).

`mail-settings.ts` loads only the mail configuration needed by the transport: API key, confirmed sender and trusted public origin. `scripts/setup-email.py` collects the key with hidden terminal input and writes `data/email-settings.json` with private permissions; `data/` is excluded from Git. Hosted email links require the exact HTTPS `OSTATKI_PUBLIC_ORIGIN` environment setting so HTTP origin checks and Secure cookies use the same trust boundary. The local origin works only on the computer running the app. The owner completed actual local inbox confirmation and recovery through Brevo. A future hosted origin needs its own delivery/link check; transport tests do not establish inbox delivery.

## Languages

RU/KK/EN dictionaries cover buyer, registration, email confirmation/recovery, café application, merchant, café pages, notifications and administrator UI. Transactional auth and order emails include localized subjects, text and HTML. Auth email links carry the selected language; users can switch it after opening. New offers and café profiles require valid content in all three languages on the server. Order and notification snapshots preserve all translations. Email-language preferences apply to new order events; queued retries keep their event language. English is the default for new visitors; a preference cookie persists later selections. Currency stays KZT. A Kazakh month-name fallback avoids incomplete CLDR data in some WebViews.

Proper names and addresses may retain their original local spelling. Localisation is not automatic machine translation of merchant submissions.

## Order support boundary

`src/server/order-issues.ts` manages the buyer/café conversation. `src/server/support.ts` adds help/complaint escalation, the administrator queue, assignment, decisions and case history inside the marketplace service's transaction. A support case has its own revision and `new`/`in_review`/`waiting`/`resolved` status; it does not replace the order lifecycle or conversation status. Participant messages update the case revision, and buyer resolution is blocked while support is active.

Party access requires current buyer ownership or the current café owner's venue. Queue reads and actions require a current verified administrator. Routes re-resolve sessions after asynchronous body parsing; assignment availability also uses current role/verification state. Admin order DTOs omit the pickup code. Decisions require explanations in all three languages; free-form chat/history notes retain their author's language.

Support mutations bind idempotency to the actor and original payload. Replays precede assignment/state/revision conflicts, while authorization is checked again. Assignment and decision actions use a case revision; stale screens must reload. The UI scopes frozen requests to actor and case/order, persists their payload before POST and retains unknown outcomes for the same retry. The conversation cap is 50 messages, including support replies; escalation at the cap records context in history, and resolution does not consume a chat slot.

Support records decisions without changing order state, stock, payment or café moderation, and has no support-mail dispatch yet. See [support workflow and API](support.md).

## Deployment boundary

See [café pages and photographs](venue-media.md) for profile revisions, moderation snapshots, private upload storage and exact image access rules. The database file and its companion photo directory require the same durable volume and coordinated backups.

This application runs on Node.js 24 with durable SQLite storage. It must not be deployed unchanged onto a stateless edge filesystem. Before public shared usage, prepare a clean commercial database without development fixtures, configure the exact HTTPS `OSTATKI_PUBLIC_ORIGIN`, connect and check real email delivery, and set up migrations/backups. Multiple replicas require a shared durable store. The earlier persona endpoint is closed; old sample-account cookies are rejected. A mail configuration containing a public HTTPS address does not replace the required runtime origin setting.

References: [Next route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [Next cookies](https://nextjs.org/docs/app/api-reference/functions/cookies), [Node SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html).

## Registration and moderation

See [authentication and moderation](auth-moderation.md) for password, session, email capability, privilege and review boundaries, and [email delivery](email-delivery.md) for setup. Public registration accepts only buyer/café account types. Administrator grants are trusted local operations against an existing registered account and revoke old sessions. Every request reads the current role and mailbox status from the database; moderation reads and mutations require a verified administrator.

## Nearby discovery boundary

A nullable point belongs to the café profile and its moderation revision, rather than to individual offers. `src/domain/geography.ts` validates geographic numbers and computes great-circle distance. `src/server/nearby.ts` queries approved venues, current offer stock/expiry, localized search and radius before the response cap. Search coordinates are SQLite statement parameters and are never persisted. Unlocated cafés have a separate DTO list; ordinary offer distances are nullable instead of invented.

The buyer owns only the transient search origin and interface filters. `MapCanvas` wraps locally bundled Leaflet and initializes it when visible on the client; it never grants location access. Explicit one-shot browser geolocation uses rounded coordinates with cancel-safe callbacks. Owner changes go through the existing profile and moderator authority. See [nearby discovery](nearby.md) for the HTTP, privacy and map-provider boundaries.

## Frontend and server module boundaries

The frontend uses FSD layers with public entries and downward imports. Next.js adapters in `src/app` compose `_pages` and `_app`; they are separate from those FSD layers. Browser modules cannot import `src/server`, server domain validation or Node built-ins. Shared DTOs are TypeScript contracts, not runtime authorization. The guard in `scripts/check-architecture.mjs` checks type/value imports, dynamic imports, peer-slice dependencies, public-entry access and cycles as part of `pnpm check`.

The backend remains a modular monolith. `MarketplaceService` composes focused use cases; `Repository` delegates SQLite work to infrastructure. Existing auth, moderation, support, media and notification modules retain their transactional contracts. See [ADR 001](adr/001-fsd-and-modular-backend.md).
