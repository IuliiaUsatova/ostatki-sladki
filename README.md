# Ostatki Sladki / Остатки сладки

A food-rescue marketplace for discounted meals and surprise bags from cafés in Almaty. Buyers reserve food and collect it within a pickup window; cafés manage availability and confirm handoff.

The product began as a joint initiative with UX/UI designer Aleksandr Evstratenko. The application follows the [Figma designs](https://www.figma.com/design/8FZnmYn4ihOn7q1eHQxxfH?node-id=2010-526).

## Working features

- Email/password registration and sign-in for buyers and café owners; durable accounts and revocable cookie sessions.
- Mailbox confirmation and password recovery with one-time email links; localized transactional email through Brevo.
- Café application, owner corrections and resubmission; administrator approval, rejection, change requests and suspension.
- Revision checks, application snapshots and a moderation audit trail with messages in Russian, Kazakh and English.
- Catalogue, search, meal/bag filters, venue discovery, guarantees and allergen information.
- Atomic five-minute reservations, confirmation with payment at pickup, order history and cancellation.
- Café cancellation with a recorded reason and automatic offer pause; automatic completion of uncollected bookings at the original pickup deadline.
- Private order conversations between buyer and café owner, with replies, revision-checked buyer resolution and reopening.
- Order support requests and complaints, with an administrator queue, assignment, revision-checked actions, decisions in all three languages and a shared history.
- Nearby café map with moderated pickup points, explicit geolocation, distance/radius search and a fallback list for cafés without coordinates.
- Café stock/price/window edits, pause/resume, multilingual offer creation and collection by a six-digit code.
- Owner photo uploads, cover/gallery ordering and a public café page with three-language descriptions, collection instructions, weekly hours and current offers.
- Profile changes return the café to moderation; administrators review the photos, translations, hours and immutable submission versions before approval.
- Private buyer/café notifications for confirmed, cancelled and collected bookings; unread filtering, pagination and read markers.
- Persistent order-email jobs and background pickup reminders, with per-account email opt-out and RU/KK/EN email language.
- Server checks of identity, role, venue, ownership, approval, stock and pickup windows.
- Complete RU/KK/EN interface. English is the initial language; the language choice persists.

Payment at pickup is the current booking model. Online payment, settlement and refunds are not implemented. Confirmation creates a booking and pickup code; it does not record a successful payment.

## Run

Requires Node.js 24 and pnpm. The app and API run in the same Next.js project.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3103](http://localhost:3103). For the production build locally:

```sh
pnpm build
pnpm start
```

Stop the development server before building/starting on the same port. Development polling avoids macOS watcher limits.

Both `pnpm dev` and `pnpm start` supervise the Next.js server and a dedicated notification worker. The worker checks durable reminders and mail jobs every 15 seconds, including when nobody has a browser open. Stopping the command stops both processes. Running `next start` directly starts only the web process and does not start scheduled notification work. The supervisor accepts `--port` for isolated QA through `node scripts/run-app.mjs start --port 3104`; it inherits the selected database/provider configuration without printing it.

## Administrator setup

1. Register your own account at `/register` and choose the buyer account type.
2. Confirm your email from the delivered link. Sign in to the same account first, reopen the email link and use the confirmation button; sign in again after confirmation.
3. From this project folder, grant the existing account administrator rights:

```sh
node scripts/grant-admin.ts --email YOUR_EMAIL
```

4. Sign in again at `/login`. Existing sessions are revoked when privileges change. Verified administrator accounts use `/admin` for café moderation and `/admin/support` for order support.

Administrator rights cannot be chosen during registration or granted through a public HTTP endpoint. A trusted grant does not substitute for mailbox confirmation.

## Email setup and account recovery

Brevo is the selected email provider. The app sends confirmation, reset and password-change messages in English, Kazakh or Russian. Configure a confirmed sender and API key privately with:

```sh
python3 scripts/setup-email.py
```

The script prompts for the key with hidden input and saves private settings in `data/email-settings.json`, excluded from Git. Never paste the key, a password or an email capability link into chat or a bug report. See [email delivery setup](docs/email-delivery.md) for provider preparation and the real-inbox acceptance check.

Registration remains saved if the first email cannot be submitted; the signed-in account can request another confirmation. Unverified users can browse and access their own existing work, but cannot create/confirm reservations, create/edit selling offers or access administrator moderation.

Confirmation links last 24 hours and require a signed-in account matching the link. Reset links last 30 minutes and set a new 15–128-character password with repeat confirmation. Each successful confirmation or reset invalidates other outstanding links and signs out all sessions. Reset also confirms ownership of the email; neither flow automatically signs the user in.

The configured recovery endpoint gives the same acknowledgement for unknown accounts, cooldowns and provider failures. An acknowledgement means the request was accepted, not that a message reached an inbox. Delivery is submitted once per eligible request; there is no background outbox or automatic mail retry. The owner completed real local confirmation and recovery through Brevo; public-hosted delivery links need their own check after deployment. See [verification](docs/verification.md).

## Café onboarding

Register a café account with its name, address, description and business contact. The venue remains pending until an administrator reviews it. The owner can see reasons, correct the application and submit again. Changing approved venue information also starts a new review. A stale review cannot approve a newer submission.

In the café workspace, the café page editor accepts descriptions and collection instructions in RU/KK/EN, seven days of opening hours and up to eight gallery photographs. The first photograph is the cover. The owner can upload JPEG, PNG or WebP files up to 6 MiB and choose uploaded photos for offers as well as the gallery. Uploading alone does not publish an image. A new profile submission returns the venue to pending review, hiding its public page and new sales until approval. Administrators can inspect all three translations, hours, photos and earlier submission snapshots. Approved café pages are available at `/venues/{id}` and linked from venue discovery and offer details.

The server validates actual image content, rejects animated or oversized images, autorotates, resizes to fit 1920 × 1920 and encodes WebP without source metadata. The private upload library allows 40 photographs per venue; removing one from the gallery detaches it without destroying historical order or review references. See [café pages and photographs](docs/venue-media.md).

Unapproved venues cannot publish or receive new confirmed bookings. Already confirmed bookings retain their terms and can still be fulfilled by their venue, including during suspension.

## Order notifications

`/notifications` is each account's private inbox. Confirmed, cancelled and collected bookings notify their buyer and café owner; five-minute holds do not create notification noise. The inbox shows original order translations and pickup terms, with links to the current authenticated order. The recipient can mark one or all existing messages read, filter unread messages and load older pages. `/profile` stores preferences for order email and its language. Buyer/café accounts must confirm their mailbox before enabling order emails. Turning these emails off leaves the in-app history available and does not disable security emails for confirmation/password recovery.

A confirmed booking schedules a buyer reminder 30 minutes before the original pickup start. Cancelled or collected bookings cancel that reminder. A booking first confirmed at or after the reminder time does not receive a second immediate message. Restarting during a still-valid pickup window can catch up a scheduled reminder; restarting at or after its end skips it. Existing confirmed bookings can still receive reminders while the venue is suspended. A stopped server cannot run scheduled jobs.

Café owners can cancel a confirmed booking with a reason before its original pickup end. This pauses the offer and notifies both parties without cancelling other confirmed bookings. After the original pickup end, the worker closes uncollected bookings and notifies the buyer and owner. Their quantities stay committed, and old pickup codes cannot be reused. Buyers can open an order conversation, receive a café reply, resolve it or reopen it. Either party can ask central support for help or submit a complaint from the same booking. See [order completion and conversations](docs/order-lifecycle.md).

The order change, private notification, reminder schedule and email job commit together. Brevo acceptance is distinct from inbox delivery. Missing email configuration leaves jobs queued; temporary failures retry with bounded backoff and attempts. Queued messages retain their event language; updated preferences affect new events. Turning email off suppresses pending order mail, and current recipient/order state is rechecked before each send. See [order notifications](docs/order-notifications.md) for storage, retry and deployment boundaries.

## Nearby discovery

Café owners set a pickup entrance in their profile; location changes require a new moderation decision. `/nearby` shows approved points, searches names, addresses and localized offer titles, and computes real straight-line distances from an explicitly selected area or browser location. Unlocated cafés remain available in a separate address list. Search coordinates are transient and sent in a POST body. Maps use locally bundled Leaflet with OpenStreetMap tiles; addresses and list search work when maps are unavailable. See [nearby discovery](docs/nearby.md).

## Order support

`/admin/support` lists help requests and complaints, with status/type/assignment filters, search and paginated results. An administrator takes a case before replying or recording a decision. Decisions require an explanation in RU/KK/EN, and both order participants can see the conversation, outcome and action history. An active support case prevents the buyer from independently resolving that conversation. Further buyer messages or an explicit request for reconsideration can reopen a resolved case.

Support uses current server-side roles and ownership; pickup staff cannot read the queue or order conversations. Administrator order details omit the pickup code. The 50-message conversation limit still allows escalation through the support history and permits a decision without adding another chat message. Support actions do not change stock, bookings, payments or café moderation. Case updates currently do not create support emails. See [support workflow and API](docs/support.md).

## Stack and layout

Next.js 16 App Router, React 19, TypeScript, plain CSS/CSS modules, native Node SQLite, self-hosted Inter/Roboto and local Figma assets.

```text
src/app/                       Next.js route adapters, layouts and HTTP endpoints
src/_app/                      Locale/application providers
src/_pages/                    Screen composition and page-specific controllers
src/widgets/                   Reusable composed café editor and order discussion
src/features/                  User actions: edit offer, collect, support, preferences
src/entities/                  Offer/order/venue presentation and localized model helpers
src/shared/                    Transport contracts, i18n, UI primitives and browser utilities
src/domain/                    Server runtime validation and domain entry points
src/server/modules/            Authz, sessions, buyer orders, merchant and offer use cases
src/server/infrastructure/     SQLite connection, schema, migrations, queries and commands
src/server/                    Composition, auth, moderation, support, media and background mail
scripts/                       Local account provisioning, startup and architecture guard
tests/                        Isolated business, security, concurrency and language checks
docs/                         Architecture decisions, API/workflows and verification
public/images, icons/          Local Figma assets
legacy/vite/                   Preserved initial React/Vite foundation
```

See [FSD and server boundaries](docs/adr/001-fsd-and-modular-backend.md) for import rules, retry ownership and architectural trade-offs. The original `ROADMAP.md` is retained as the initial product plan.

## Data and reliability

The default database is `data/ostatki.sqlite`, excluded from Git. `OSTATKI_DATABASE_FILE` optionally chooses a separate database file for isolated QA or a persistent deployment volume. Browsing, registration and local development can run without an email provider; actual email delivery requires the private mail configuration.

Passwords use salted, asynchronous scrypt; credentials, session tokens and raw email tokens are never returned in account DTOs. Email capabilities are stored as digests tied to their purpose, expiry and credential revision. Login/mail attempts and native hashing work are limited. Mutation routes require same-origin requests and bounded JSON bodies. Previous sample-persona sessions cannot authenticate real API requests.

The server calculates prices and stock in SQLite transactions. Idempotency binds a retry to the actor and original payload. Orders keep immutable prices, addresses, windows, guarantees, allergens and all three translations. Time is stored in UTC and shown in Almaty time.

New production databases start empty. Development/test startup enables fictional fixtures through `NODE_ENV`; standalone and production startup do not. Tests that need catalogue fixtures pass `seedFixtures: true` to the repository explicitly. Existing databases are preserved, so a previously populated local database must still be replaced or prepared deliberately before commercial use.

When deploying behind an HTTPS reverse proxy, set `OSTATKI_PUBLIC_ORIGIN` to the exact public HTTPS origin. The server uses this fixed origin for mutation checks and secure cookies; forwarded headers cannot choose the trusted origin.

## Verify

```sh
pnpm check
pnpm format:check
```

The check runs the FSD dependency guard, strict TypeScript, ESLint, isolated tests and a production build. GitHub Actions repeats these checks and formatting on pushes and pull requests. The suite covers concurrent reservations, stock release, retries, exact time boundaries, ownership, credential validation, session rotation/revocation, email capability consumption, recovery, throttling, moderation revisions, suspension, support assignment/revisions/reopening, persistence and all UI language dictionaries. See [verification](docs/verification.md).

## Next release work

Online payments/refunds and email notifications for support remain separate features. The support queue records explanations and complaint outcomes; it does not perform financial settlement. Public deployment also needs HTTPS, the exact `OSTATKI_PUBLIC_ORIGIN`, a public inbox/link check, durable database and photo storage, backups and production data preparation. The web process and its notification worker share a persistent SQLite disk; this layout does not support stateless Workers or independent replicas unchanged.

## Author

Iuliia Usatova — frontend engineer focused on business logic, operational systems and full-stack product development.
