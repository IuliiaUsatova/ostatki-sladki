# Order notifications and delivery jobs

## Transaction and inbox

Buyer confirmation, buyer/café confirmed-booking cancellation, collection and unrecorded pickup completion create notifications for that buyer and the café owner. Releasing/expiring a temporary hold does not create a message. `recordOrderNotifications` runs inside the same SQLite transaction as the order transition and its audit/idempotency records: an outbox insert failure rolls back the whole transition, rather than committing an order without its notification. A unique `(user_id, order_id, kind)` key prevents duplicate event messages on retries.

Notifications contain an immutable snapshot of the original offer's three translations, venue name/business address, quantity, total and pickup window, plus order ID/number. Cancellation snapshots add only the buyer/café actor category and predefined reason, without free-form notes. They contain no pickup code, authentication capability, other account's email or contact phone. The UI renders the selected interface language; order state, detailed cancellation notes and pickup code remain behind authenticated order endpoints. All nine notification kinds have RU/KK/EN email templates.

The inbox GET accepts only a bounded limit (1–50), all/unread filter and validated opaque cursor. All read/list mutations bind to the current database user; there is no global administrator inbox. Marking a message read is idempotent and scoped to its owner. Mark-all reads existing unread rows atomically; messages created afterward remain unread. Mutations use same-origin checks and resolve the live session again after asynchronous body parsing.

## Preferences and reminders

Verified registered buyer/café owners default to order email enabled in their account language. Fixture users without credentials never receive mail jobs. Accounts can opt out without deleting their inbox; enabling requires fresh mailbox confirmation and an eligible role. Confirmation and password-recovery mail are separate security flows and are not disabled by this preference. The queued job keeps its original language so retries use the same rendered content; new events use newly saved preferences.

Confirmation writes a durable reminder row due 30 minutes before the original pickup start. It is scheduled only when confirmation happens before that due point. `generateDueReminders` processes at most 100 due rows in a transaction, rechecks current order state and original confirmation time, and materializes one buyer notification/mail job. Cancellation/collection cancels the schedule and suppresses obsolete pending confirmation/reminder emails. A catch-up reminder can run during the pickup window, but is skipped at its exact end. Suspension does not invalidate already confirmed fulfilment.

## Background process

`scripts/run-app.mjs` starts Next and the Node notification CLI together for both development and production. The CLI opens the selected SQLite file independently, runs a first check at startup, and repeats every 15 seconds. Each tick first finalizes up to 100 still-confirmed bookings at their original pickup end, even when mail is unconfigured, then checks reminders and dispatches mail. Later ticks drain a larger completion backlog. It does not depend on page visits or client timers. SIGINT/SIGTERM stops new checks, waits for the active bounded task and closes its database; the supervisor terminates both children and has a bounded forced-shutdown fallback.

Production hosting must keep these processes running against the same durable database/photo volume. Building the application does not start the worker. Running bare Next commands without the supervisor does not run reminders. If the server is stopped, due jobs stay durable for catch-up at restart; elapsed pickup windows are skipped.

## Email outbox

The worker runs one tick per process, claims jobs one at a time with a 45-second SQLite lease and processes at most ten per tick. Current ownership, eligible role, verified mailbox, opt-out, order state and pickup end are checked immediately before dispatch. Acknowledgement updates only a still-live matching lease. A crashed/expired lease is reclaimed or fails at the attempt bound; it never becomes a permanent misleading processing state when configuration is unavailable.

Brevo transport uses the fixed HTTPS API, a four-second timeout, redirect rejection and a stable job UUID in the documented payload idempotency header. It accepts only the provider's expected success response. A missing configuration check leaves jobs pending without spending send attempts. Temporary failures retry with bounded exponential delay (30 seconds up to five minutes) and at most six attempts; permanent rejection stops immediately. Error codes are generic and provider bodies, addresses, credentials and order payloads are not logged.

This is at-least-once submission, not a delivery guarantee. Provider deduplication has a finite retention period, and a crash/timeout after provider acceptance but before the database acknowledgement can lead to a duplicate on retry. Once dispatch has begun, later cancellation or opt-out cannot recall an email already accepted by the provider. `accepted` means accepted by the email service; delivery/bounce tracking needs a separate verified webhook integration.

The email contains a login-protected buyer order link or a venue-scoped merchant order link, and a link to notification preferences. HTML escapes submitted business text. Russian, Kazakh and English have both text and HTML templates; Kazakh month names are explicit.

Reference: [Brevo transactional email API](https://developers.brevo.com/reference/send-transac-email). Auth-email delivery and private setup remain documented separately in [email delivery](email-delivery.md).
