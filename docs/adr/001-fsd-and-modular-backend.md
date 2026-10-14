# ADR 001: FSD frontend and a modular Node backend

Status: accepted, 2026-10-14.

## Problem

The working marketplace accumulated a 1,456-line café workspace, a 1,021-line
marketplace service and a 782-line SQLite repository. Screens mixed forms, request
state, resource refreshes and presentation. Imports allowed a screen to reach into
another screen's internals. Unknown mutation outcomes could lose the original
payload after a subsequent authentication failure.

This refactor must preserve bookings, stock, ownership, moderation, support,
photographs, notifications, email and RU/KK/EN behavior. Changing folders alone
does not address these problems.

## Decision

Use FSD for browser code: `_app → _pages → widgets → features → entities → shared`.
`src/app` is the Next.js adapter directory, not the FSD application layer. The
prefixes avoid the reserved Next.js `app` and `pages` names, following the
[FSD Next.js guide](https://feature-sliced.design/docs/guides/tech/with-nextjs).

Each slice exposes an `index.ts`; external consumers use that entry. Shared
libraries and UI families have their own entries. `shared/api/index.transport.ts`
exposes React-free transport and contracts to pure utilities and Node tests.
Type-only imports also obey the layer boundary. Peer slices cannot import each
other; composition belongs in a widget or page above them. For example, the café
page passes the photograph picker into offer editing instead of the offer feature
importing another feature. Private files use relative imports within their slice.

Page controllers own screen loading and derived state. Action-specific model
hooks own offer submission and collection. UI components render those states and
call explicit commands. Shared localization owns locale and formatting; entity
helpers own localized offer/venue/order data. Existing styling remains intact.

Keep the Node backend outside FSD. `MarketplaceService` is a compatibility and
composition facade over authz, session, buyer-order, merchant and offer modules.
Each module receives only the repository operations and collaborators it needs.
`Repository` retains its public API and delegates connection/schema/migrations,
queries and commands to SQLite infrastructure. Auth lifecycle, moderation,
support, photos and notifications retain their existing focused modules.

This applies single responsibility and narrow dependency contracts where concrete
problems exist. Clock, mail and storage boundaries remain replaceable in tests.
No inheritance hierarchy, generic CRUD framework or class-per-function is added
to claim SOLID compliance. SQLite transactions are synchronous: stock, snapshots,
audit, notifications and idempotency records still commit or roll back together.

## Mutation protocol

Before sending a mutating request, persist an immutable attempt scoped to the actor
and resource. Reuse its payload and key after a lost response, reload, 401/403,
429 or server failure. Block another submission synchronously with a ref lock;
rendered `pending` state alone cannot prevent two calls in the same event turn.

Only a confirmed result or a definitive rejection can release the attempt. Browser
storage failure blocks sending, rather than silently creating a new key. Legacy
saved offer attempts are migrated before restoring the form. Server replay checks
continue to recheck authorization and match the actor and original payload.

Offer creation and order collection use server idempotency keys. Offer PATCH
retries preserve the same absolute field assignments; the local envelope key is
not added to a PATCH contract that does not accept it. A callback or refresh error
after a known commit must not turn that commit into a retriable mutation failure.
Resource invalidation returns `void`; it does not pretend that awaiting it waits
for the subsequent GET to finish.

Concurrent resource subscribers share only an in-flight GET for the exact URL.
Settled responses are evicted, so there is no retained result cache. Each subscriber
owns its cancellation; the transport aborts when the final subscriber leaves.
Reload and mutations invalidate pending sharing so a new read cannot join the
request that began before the write. Loading/error state still belongs to each
resource consumer.

## Alternatives and consequences

Keeping screen-oriented `components` folders would be cheaper initially but would
leave dependency ownership implicit. Applying FSD to SQL and server use cases
would obscure their transaction and trust boundaries. Adding an ORM or query
library would change runtime behavior without being necessary for this refactor.

The chosen layout adds public-entry files and explicit model/UI boundaries. The
AST-based architecture guard checks imports and cycles in CI so those boundaries
remain enforceable. It is a small local tool with fixture tests; replacing it with
a maintained FSD linter later is possible. Shared CSS families retain the existing
visual vocabulary and can be converted to a design system independently.

The domain DTO/error/geography entries remain compatible with existing server
consumers. Shared transport types do not validate an HTTP request or authorize an
action: the server still performs runtime validation and current-session checks.

## Verification

Run `pnpm check` and `pnpm format:check` on Node.js 24. Tests use isolated databases,
injected clocks/transports and explicit fixtures. They cover transactions,
concurrent reservations, replay, ownership, email/session security, moderation
revisions, support decisions, media access, notifications, dictionaries and failed
mutation restoration. Browser regression uses an isolated server with outbound
mail disabled; the owner's database and credentials remain untouched.
