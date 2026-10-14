# Order completion, café cancellation and order conversations

## Order states and authority

The server owns all transitions. `confirmed` bookings are payable at pickup; cancellation does not claim a payment or refund. Buyer cancellation still closes at the original pickup start. A current, verified café owner can cancel their own confirmed booking before its original pickup end, including during the pickup window and while the venue is pending or suspended. Pickup staff, administrators and other venues cannot use this owner operation.

Café cancellation requires a reason (`unavailable`, `closed`, `quality_issue` or `other`), with an explanatory note required for `other`. The cancellation, reason, audit event, offer pause, idempotency record and both parties' notification/email jobs commit together. Another confirmed booking is not cancelled automatically and remains fulfilable. Paused offers cannot receive new reservations or confirm an existing temporary hold; the owner must deliberately resume an offer after resolving its availability. Cancellation frees the affected booking's capacity but the pause prevents immediate rebooking.

At the exact original pickup end, a still-confirmed booking becomes `not_collected`. This means no handoff was recorded; it does not establish buyer fault or impose a penalty. The original order snapshot determines the deadline even if the café edits the offer. The quantity remains committed, so extending an offer cannot put old food back on sale. Pickup codes remain reserved to their original order and terminal orders cannot be collected.

The service finalizes overdue bookings before marketplace operations. The supervised background worker also finalizes a bounded batch independently of browser visits and email configuration, then generates reminders and dispatches mail. Restarting resumes overdue work. Transition, audit and terminal notifications are atomic; retries and concurrent workers cannot create a second completion event. A stopped server cannot run the sweep.

Existing databases migrate their order/notification status constraints transactionally while preserving related rows and indexes. The migration checks foreign-key integrity before committing and restores foreign-key enforcement afterward.

## Private conversation attached to a booking

A buyer can open one conversation about their own previously confirmed booking, including after cancellation, collection or an unrecorded pickup. Temporary holds and expired unconfirmed reservations cannot open a conversation. Categories are pickup, food, cancellation and other. Messages are 5–2,000 characters with a maximum of 50 messages per conversation.

The buyer and that café's current owner can view it. The owner can reply; the buyer can follow up, resolve it, or reopen it with a new message. Buyer messages set `open`, owner replies set `answered`, and buyer resolution sets `resolved`. Resolution uses a revision check so a new reply cannot be silently closed by an outdated screen. The buyer cannot resolve a conversation while its central support case is active. Café replies to a resolved conversation are rejected until it is reopened. Creation and messages use an actor-bound idempotency key and original payload for safe retries after a lost response.

Without escalation, the conversation is between buyer and café. Either party can send it to central support as a help request or complaint; verified administrators then see its messages, case history and order snapshot without the pickup code. Messages and support decisions never change an order's state, inventory or payment. Venue suspension does not hide an existing booking's conversation. Authentication and current order/venue ownership are checked on the server; mutation routes re-resolve the session after asynchronous body parsing.

The café order list includes a lightweight conversation status and a needs-reply filter, so new buyer messages are visible without opening every order. Its scoped summaries contain no message text, pickup codes or contacts; pickup staff receive none. A known successful owner reply refreshes the order-list summaries.

## Central support

A support case keeps its original help/complaint type and links to the booking's conversation. Its states are `new`, `in_review`, `waiting` and `resolved`, independently of order and conversation status. The administrator queue supports filters, search and bounded cursor pages. A case must be assigned to the acting administrator for replies, waiting/resume, release or a decision; revisions prevent stale screens from overwriting new participant messages or another administrator's work. An unavailable assignee can be replaced with a recorded history event.

Each decision requires a predefined outcome and explanations in Russian, Kazakh and English. A help request permits information provided or agreement reached; complaints also permit upheld/not upheld. Decisions and their history are visible to both parties. A buyer's later message reopens the resolved case; either party can explicitly request reconsideration, and an administrator can reopen it and take responsibility.

The 50-message cap applies to the conversation, including administrator replies. At the cap, an escalation still records the participant's explanation in support history, and a decision can be recorded without appending a message. Support actions have no stock, payment, refund or moderation side effects. Support-email notifications are not implemented. See [support workflow](support.md) for API, retry and role boundaries.

## Languages and notifications

Statuses, reason labels, actions, errors, event descriptions and mail subjects support RU/KK/EN. Merchant/buyer free text is shown in its original language. Cancellation notification snapshots contain only its actor category and predefined reason; free-form notes stay inside the authenticated order. Closed bookings suppress stale confirmation/reminder jobs. `order_not_collected` and `booking_not_collected` notify both parties once. Provider acceptance is distinct from actual inbox delivery.

## Verification

Use isolated SQLite fixtures and mocked email transport. Cover exact time boundaries, original snapshots, suspended venue access, stock after offer extension, cancellation/collection races, migration/reopen integrity, transaction failure rollback, duplicate/changed retries, actor/venue ownership, message limits, revision conflicts, revoked sessions during body parsing and all three language dictionaries. Browser checks must use separate synthetic accounts and storage with outbound email disabled; they must not mutate the owner's real account or send real order mail.
