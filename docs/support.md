# Order support and complaints

## Participants and access

The buyer or café owner can escalate an order conversation for help or submit a complaint. The booking must have been confirmed at least once: confirmed, collected, not collected and cancellations after confirmation are eligible; temporary holds and unconfirmed expiries are not. There is one conversation and one reusable support case per order. A case keeps its original help/complaint type and topic when reopened.

Both parties see the conversation, decisions and support history in their authenticated order view. The café list keeps its needs-reply filter. Pickup staff cannot access conversations or support. Verified administrators use `/admin/support`; their order snapshot omits the pickup code. Each server operation reloads the current account role and checks order/venue ownership or administrator privileges. Session validation is repeated after asynchronous request-body parsing.

## Queue and decisions

The administrator queue filters by status, type and assignment (all, mine, unassigned), searches order/venue/participant information and uses filter-bound cursor pagination. The UI requests 20 rows per page; the API accepts limits from 1 to 50. Queue counts describe all cases, independently of the active filters.

| Action        | Result and condition                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Escalate      | Creates `new`, unassigned; a resolved case can return to the queue.                                                                      |
| Claim         | Sets `in_review` and assigns the current administrator; another available assignee cannot be displaced.                                  |
| Release       | The assignee returns it to `new`, unassigned.                                                                                            |
| Wait / resume | The assignee switches between `in_review` and `waiting`.                                                                                 |
| Reply         | The assignee appends a chat message and sets `waiting`.                                                                                  |
| Resolve       | The assignee records the decision and resolves the conversation and case.                                                                |
| Reopen        | An administrator takes a resolved case into review; a new buyer message or explicit party escalation can return it to `new`, unassigned. |

Participant messages during `waiting` return the case to review when assigned. An unavailable assignee may be replaced; the history records the takeover. Current availability is derived from administrator role and mailbox confirmation. Every administrator mutation checks the case revision, so another reply, assignment or decision cannot be overwritten by a stale screen. While a support case is active, buyer-only conversation resolution is rejected.

Decision codes are `information_provided`, `agreement_reached`, `complaint_upheld` and `complaint_not_upheld`. Help cases allow the first two; complaints allow all four. Every decision requires explanations in RU/KK/EN, each 5–2,000 characters. The UI displays the selected language, while messages and history notes remain in the author's language. Old decisions remain in the action history when a case is reopened.

The conversation allows at most 50 messages, including administrator replies. At that limit an escalation still records its explanation in support history, and resolution remains possible without a new chat message. Actions never change stock, booking fulfilment, payments, refunds or café moderation. Case changes currently do not enqueue support emails.

## HTTP contract

All mutations are same-origin, authenticated JSON requests with bounded bodies.

| Endpoint                                    | Purpose and body                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/orders/{orderId}/issue/support`  | Party escalation: `{kind, category, message, idempotencyKey}`; returns `{issue, serverNow}`.                                     |
| `GET /api/admin/support`                    | Queue: `status`, `kind`, `assignment`, `search`, `limit`, `cursor`; returns `{cases, counts, nextCursor, serverNow}`.            |
| `GET /api/admin/support/{caseId}`           | Returns `{issue, order, serverNow}` with a redacted order.                                                                       |
| `POST /api/admin/support/{caseId}/messages` | Assignee reply: `{message, revision, idempotencyKey}`; returns current detail.                                                   |
| `POST /api/admin/support/{caseId}/actions`  | `{action, revision, idempotencyKey}`; `resolve` also requires `resolution: {code, texts: {ru, kk, en}}`; returns current detail. |

Queue status/kind/assignment default to `all`; cursor values cannot be reused with another filter or administrator. Messages and escalation explanations are 5–2,000 characters. The topic is `pickup_problem`, `food_problem`, `cancellation` or `other`; the type is `help` or `complaint`.

## Transactions and retries

Case/conversation changes, assignment, history and idempotency records commit together. The server binds keys to actor, action and normalized payload, checks current authorization, then replays a matching completed request before applying assignment, state or revision guards. Reusing a key with different content is rejected.

The client saves the original payload and key before POST in tab-scoped browser storage, with actor and order/case in the scope. Unknown responses and authentication/rate-limit failures retain that attempt; retry sends the same body and key after reauthentication or reload. A known state/revision conflict requires fresh server state before a new action. Abort on navigation does not prove the mutation failed. Browser-storage failure blocks a new mutation before dispatch.

Backend checks use isolated databases for current roles, ownership, redaction, assignment, revisions, retries, rollback, message limits, reopening and cursor validation. Final browser QA results belong in [verification](verification.md); this document does not establish external email delivery or public deployment.
