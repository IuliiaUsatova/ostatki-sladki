# Authentication and café moderation

## Identity boundary

Public registration accepts only buyer/café types with an explicit field allowlist. The normalized email is unique; names, language and venue details are validated at runtime. Passwords preserve whitespace and Unicode, require 15–128 code points and have a 512-byte ceiling. They use async scrypt (N=131072, r=8, p=1), 16-byte random salts and constant-time comparison. Unknown accounts take the same derivation path. At most two hashes run concurrently. SQLite tracks attempt windows across restarts; expired attempt entries are removed.

Sessions use random opaque tokens in HttpOnly SameSite=Lax cookies (Secure on HTTPS), with only a digest stored in the database. Successful authentication rotates the browser session. Logout revokes the current session; administrator grants, email confirmation and password reset revoke all account sessions. Every request resolves current roles and mailbox status from the database. Old seeded users cannot authenticate without a credential record; test-only persona helpers default to disabled and are absent from the public API.

The trusted administrator CLI grants a role only to an existing registered account. An email match alone never grants access. A grant cannot bypass mailbox verification. MFA is not implemented.

## Email capability boundary

Registration creates an unverified account and attempts to submit a confirmation email. Provider/configuration failures do not roll back the account; the response distinguishes account creation from mail submission. `User.emailVerified` reflects the server's stored confirmation state.

Verification and reset use separate purposes with random 32-byte tokens encoded as 43 base64url characters. The database stores only a SHA-256 digest, account ID, purpose, credential revision and expiry. Verification lasts 24 hours; reset lasts 30 minutes. Successful consumption is transactional, increments the credential revision, deletes outstanding account capabilities and revokes all sessions. A replay, wrong purpose, expired link or stale credential revision cannot apply another change. A failed resend leaves previously submitted links usable; at most five recent links per purpose remain after a successful submission.

Confirmation requires an authenticated account matching the token's account. A guest must sign in, then reopen the email link; a different account cannot confirm it. Opening the link with GET does not consume the token: the user presses a confirmation button that makes a same-origin POST. This also prevents an unsolicited confirmation email from activating an account the recipient did not create.

The recovery endpoint is available without a session. With valid mail configuration, unknown accounts, mail cooldowns and submission failures receive the same acknowledgement with a common response delay; the response does not claim delivery. Missing configuration returns `MAIL_UNAVAILABLE`. Rate limits cover the shared lifecycle endpoints and each recipient/request action, with a 60-second submission cooldown. Limits persist in SQLite rather than resetting with the application process.

Reset preserves the normal 15–128-code-point password policy and requires matching confirmation in the form. It rechecks the capability inside the write transaction after password hashing, replaces the hash, confirms email ownership, clears login throttling for that account and signs out all sessions. No automatic login follows either confirmation or reset. A password-change notification is attempted after commit; a delivery failure cannot undo the password change.

Email URLs carry the capability and language in a fragment, never a query string. The client captures it in memory and immediately replaces the visible URL; it does not put capabilities in local/session storage. Refreshing the page requires reopening the original email link. Lifecycle pages use `no-referrer`, `no-store` and `noindex, nofollow`. Tokens, passwords and provider keys must never appear in logs, screenshots or public issue reports.

## Moderation boundary

Registration creates a pending venue and an application snapshot. Administrators review the current revision. Approval, rejection, requests for changes and suspension are transactional, version checked and recorded with actor/time/reasons and the reviewed snapshot. Negative decisions require meaningful reasons in all three languages.

Owner edits/submissions are ownership scoped and version checked. Even an approved café returns to pending after changing reviewed information. Publication and confirmation check current approval inside their write transaction; a concurrently changed application cannot retain stale selling access.

New buyer reservations/confirmations, café offer creation and selling edits, and all administrator moderation reads/mutations require confirmed email. Unverified owners can access their own application and existing orders, and can pause selling. Fulfilment of already confirmed bookings remains available to their authorized venue staff.

Already confirmed orders keep their immutable pickup terms. The same café can fulfil them while pending/suspended; a review cannot silently strand collected/confirmed stock. Unconfirmed holds cannot be newly confirmed after selling access closes. The order confirmation only means a reservation payable at pickup; no payment settlement state is asserted.

## HTTP boundary

Mutation endpoints require exact same-origin requests, reject cross-site Fetch Metadata and limit JSON to 16KiB. Direct Host validation handles Next's local-host normalization without trusting forwarded-host headers. Deployment behind a proxy needs a fixed public origin and HTTPS configuration; local QA uses a separate database and host from the user's application.

Brevo transport has a four-second timeout, rejects redirects and accepts only the provider's expected success status. Brevo processes recipient addresses, message content and capability links; provider link rewriting may affect whether the fragment survives. The actual received-link flow remains an operational acceptance check. Provider response bodies are not propagated or logged because they may contain private data. Mail origins come only from trusted configuration, never request Host headers; non-loopback deployment requires the exact HTTPS `OSTATKI_PUBLIC_ORIGIN`. See [email delivery](email-delivery.md) for configuration and remaining operational validation.

## References

[OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OWASP Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [Node 24 scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback), and bundled Next.js authentication/route-handler documentation informed these boundaries.
