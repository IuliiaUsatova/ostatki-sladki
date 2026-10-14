# Verification — 13 October 2026

## Automated checks

All 145 Node tests passed: 14 authentication/moderation tests, 18 marketplace/HTTP tests, 13 email lifecycle tests, five auth-mail transport/template tests, nine photo tests, 11 café-profile tests, 12 notification tests, 11 background-worker tests, 12 order-lifecycle tests, six order-mail tests, 11 support tests, nine nearby discovery tests, six browser-location adapter tests, one directions URL test, one email-link parser test, three role-aware return-path tests, two profile-anchor browser adapter tests and one complete RU/KK/EN dictionary parity test. TypeScript, ESLint, Prettier and the final production build passed. Earlier email delivery checks remain recorded below.

Coverage includes salted password storage, Unicode and whitespace handling, strict registration fields, duplicate-email races, bounded hashing, persistent throttling, opaque sessions, login rotation, logout and privilege-change revocation. Sample-persona sessions cannot access real runtime endpoints. HTTP checks cover same-origin requests, direct loopback Host aliases, forwarded-header spoofing, a fixed HTTPS deployment origin and cookie flags.

Moderation tests cover server-owned roles and venues, trusted administrator provisioning, pending venue sales restrictions, stale/replayed reviews, immutable submission snapshots, owner resubmission, suspension and persistence. Marketplace tests cover concurrent last-unit reservations, exact hold/cancellation/pickup boundaries, one-time stock release, immutable order terms/translations, idempotency, ownership, expired staff access and bounded input.

Email tests cover hashed purpose-bound tokens, exact expiry, matching-account confirmation, single-use consumption, concurrent resets, password/verification revisions checked after hashing, revocation of all sessions and outstanding links, retained administrator grants, resend cooldowns, persistent request limits and generic recovery acknowledgements with the same response-time floor. Failed submission preserves older usable links. A notification failure cannot roll back a committed password change. Mail checks cover all three languages, fixed trusted origins, fragment links, provider timeout/redirect boundaries and redacted provider failures.

Café-profile tests cover strict three-language content, seven distinct days, closed/open hours, gallery order/limits, same-venue photo ownership, shared moderation revisions, immutable snapshots including profile data, preservation during core application edits, pending/rejected/suspended public visibility, stale editors across SQLite connections and persistence. A profile-specific 32 KiB JSON limit accepts maximum valid multilingual text while other endpoints retain their 16 KiB bound. Actual handlers for ten protected JSON routes are exercised with a paused body: revoking the session before the rest arrives gives 401 and no database changes.

Photo checks cover real JPEG/PNG/WebP decoding, MIME mismatch, truncation, animation including APNG, byte and pixel limits, autorotation, WebP output without EXIF, current owner and mailbox checks, same-origin protection, session revocation after asynchronous work, bounded decoding concurrency, persistent throttles/quotas, cleanup after failed writes, publication revocation and access to immutable order-image references. The companion storage and database survive reopening.

Notifications tests cover an outbox failure rolling back the order transition, absence of temporary-hold mail, recipient ownership, safe immutable snapshots, idempotent event jobs, cancelled/collected suppression, exact reminder due/end/late-confirm boundaries, suspended venue fulfilment, preferences, no fixture-email jobs, cursor bounds, unread/read-all behavior, persistence and actual HTTP session/Origin/revocation checks. Worker tests cover one active tick, SQLite leases, obsolete/expired lease acknowledgement, missing/disappearing configuration without spending send attempts, retry bounds, suppression and restart recovery. They also prove completion at the original pickup end without email configuration, preserved stock/code and one-time terminal messages after reopening. Order-mail tests exercise all 27 kind/language templates, localized café cancellation actors/reasons, escaped business content, Kazakh months, stable event language/key, fixed origins and generic transport errors; provider acceptance is never treated as inbox delivery.

Order-lifecycle tests cover exact completion boundaries, original order terms after offer extension, bounded worker catch-up, retained pickup codes and consumed stock, owner cancellation before/during pickup, automatic offer pause and blocked held confirmation, safe fulfilment of other bookings, atomic rollback on notification failure, issue eligibility and private role/venue scope, replayed/changed retries, messages/reopening/resolution revisions, the message cap, legacy schema migration and migration rollback, and actual HTTP routes with sessions revoked during slow body upload.

## Real order-mail inbox acceptance

On 13 October 2026 (14 October UTC), an isolated production app on `127.0.0.1:3104` used a fresh temporary SQLite database and the already configured Brevo transport. Fixture registration used the unconfigured auth mailer, so no confirmation/reset capabilities were sent. A guarded order mailer allowed only the owner's Gmail address and its explicitly chosen plus-address variants, required the unique QA café marker, and limited the run to the 15 expected order messages. Gmail account identity was checked before a marker-only mailbox search; unrelated messages were not read. Private provider settings and the owner's password were not inspected or changed.

Three separate verified fixture buyers retained their own RU/KK/EN mail preferences. Actual HTTP login, reservation, confirmation, replay and preference routes passed 37 checks. Each confirmed order produced exactly one buyer and one café confirmation. All six confirmations arrived in Gmail's Inbox, with the correct language, order number, amount and Almaty pickup time.

The web process and worker were stopped and reopened on the same isolated database before the reminder due time. The ordinary 15-second worker generated and submitted all three reminders using real wall time, without browser activity. Each arrived once in Inbox. Subsequent cancellation (RU), collection (EN) and pickup-window completion (KK) generated both role-specific terminal messages. Those terminal scenarios used the injectable fixture clock rather than waiting for the full pickup window; 13 lifecycle checks passed. Repeated cancellation, collection and worker ticks created no duplicate jobs.

A targeted Gmail read matched all 15 received messages to their outbox idempotency keys. All were in Inbox, none were in Spam, and each passed Gmail's DKIM/SPF/DMARC checks. The 183 mailbox assertions checked unique event receipt, language, immutable order details, expected recipient, one transport attempt and absence of the actual pickup code. This establishes delivery for this run; the app still correctly labels provider acceptance separately from inbox delivery. The main database retained the owner's verified administrator grant and contained no QA cafés or plus-address accounts.

The buyer link required authentication, retained the exact order destination and opened the matching order. The existing café link selects its matching order. A discovered notification-settings link was corrected to `/profile#email-updates`, with a strictly allowlisted return destination after sign-in. Browser acceptance caught and corrected stale same-document hash state and a duplicated anchor after client-router authentication. Only this exact destination now uses a full document replacement after successful sign-in; other account navigation is unchanged. On the final build, ordinary guest profile login, same-document anchor changes, guest → sign-in → exact settings anchor and the already-authenticated Continue link passed. The correct section received keyboard focus after async session loading. Settings labels were inspected in RU/KK/EN. All isolated recipients were opted out after the run, no jobs remained pending, and the QA processes/tabs were closed.

Brevo currently supplies its authenticated relay sender domain for the configured Gmail sender. Public HTTPS links and delivery from the deployment still require their own acceptance after hosting is configured. The 15-message run covered all nine event kinds across three languages; all 27 kind/language combinations remain covered by template tests rather than 27 real submissions.

## Nearby acceptance

Nine new domain/route tests cover finite map-bounded numeric points, zero coordinates, international date-line/near-antipodal geometry, strict search/radius shapes, absent or malformed legacy points, literal three-language search, current stock/expiry and approval, geographic filtering before the 500-result cap, moderation revisions/snapshots and preservation across a database reopen. Ordinary offer DTOs no longer expose a fictional distance. Six injected browser-position tests cover rounding, unsupported/invalid data, denial, timeout, synchronous errors, cancellation and repeated/late callbacks. Directions tests keep the destination public and encode address text without introducing a buyer origin. Map/nearby/editor/review RU/KK/EN dictionaries retain key and placeholder parity.

The final production API passed 75 live checks on a fresh isolated SQLite database at `127.0.0.1:3104`, with outbound mail disabled. Guest and authenticated search, foreign Origin denial, invalid numeric/radius/search input, localized titles, literal injection-like queries, exact-center/radius geometry, unknown-point separation, pending café privacy and DTO contact redaction passed. An API-only café proved point edits return the profile to pending, stale decisions cannot overwrite the revised point, approval restores public discovery, and depleted/expired offers disappear. The search origin was neither echoed nor persisted; accepted real mail jobs stayed at zero.

Browser acceptance exercised EN/RU/KK discovery, kind/title search, radius changes, a separately expandable list of cafés without points, empty results and filter reset. A café owner clicked the real map, received five-decimal coordinate fields, encountered a local error and field focus for an incomplete pair, removed the point and submitted a valid point in the existing profile revision. That café was absent from public search while pending. An administrator reviewed the exact coordinates and visible map, approved revision 4, and produced revision 5 with the same point. Editor, moderation and public map labels were inspected in all three languages. The public café page rendered the approved point and a destination-only directions link, without ordinary fake offer distances.

After restarting the supervised app on the same isolated disk, the café appeared in public map results with its approved point. Clicking a marker and selecting its card affected the same venue. The final marker implementation retained focus through selection with both Enter and Space. Read-only markers are images rather than keyboard buttons. Short distances displayed in metres (20 m in the fixture) and longer distances in kilometres (1.3 km). OpenStreetMap tile images loaded, attribution was visible, and image elements used `strict-origin-when-cross-origin`. Hidden moderation maps initialize only when visible; the no-IntersectionObserver fallback requires an explicit Open map action and was inspected in code review rather than emulated in the browser.

Nearby and the public café page had no horizontal page overflow at measured 480 and 2560 CSS pixels. The in-app browser clamps smaller viewport requests; this is not a 390-pixel or physical-device result. Viewport overrides were reset. A screenshot of the synthetic map/search was saved as evidence. Real device geolocation permission/GPS was not requested during QA; its API callbacks were tested with injected providers, and the actual browser flow used manual map-area selection. Real device GPS, public HTTPS and map-provider outage checks remain release work.

A private opaque SQLite backup was made before updating the main local app, without inspecting credentials or account data. The final web/notification supervisor is running on port 3103. Existing main café points were not guessed or replaced. Support/order mail inbox delivery and public deployment remain separate steps.

## Order support acceptance

Eleven support tests cover confirmed-booking eligibility, buyer/café scope, current verified administrator roles, unavailable-assignee takeover, immutable public history, exclusive assignment, idempotent replay before revision/state guards, strict three-language decisions, kind-specific outcomes, participant reopening, the 50-message boundary, transaction rollback, keyset pagination and literal Unicode search. The actual admin DTO omits pickup codes and automatic contacts. Route tests include strict query keys, same-origin mutation guards, a 32 KiB decision body and session revocation during body upload. The legacy message CHECK migration preserves rows/FKs/indexes and rolls back a broken upgrade. New language dictionaries have matching RU/KK/EN keys and placeholders. Login routing preserves only a canonical case UUID.

The final production build passed 62 real HTTP checks on an isolated SQLite database at `127.0.0.1:3104`, with outbound mail disabled. They covered role denial, unverified administrator denial, redacted details, filters and bounds, changed-payload retries, revision/assignment conflicts, administrator replies, all-three-language resolution, participant reopening and immutable decision history. Support did not change either booking, committed stock, retained pickup codes or accepted email jobs. Provider/inbox delivery was not exercised.

Browser acceptance used disposable accounts on that same isolated origin, separate from the owner's `localhost:3103` cookie. A guest case link survived sign-in. An administrator claimed a complaint, retained a reply draft through the workspace Refresh button, replied, and recorded an explicit decision with RU/KK/EN explanations. Buyer and café screens read the same shared conversation. A buyer follow-up reopened the case while keeping the prior decision in history. A separate new complaint was submitted through the Kazakh interface, and a café reply appeared in its conversation and action history. Both cases and the past decision survived a supervisor restart. The café account received the administrator access denial.

Filters for complaint/mine/order number selected the expected case; an unmatched search displayed an empty queue while global counts retained their meaning. Admin queue and detail geometry had no horizontal overflow at measured 480 and 2560 CSS-pixel widths. The browser clamps smaller viewport requests, so this does not establish a 390-pixel or real-device check. EN/RU/KK labels, statuses and decision explanations were inspected; participant free text stayed in its original language. Temporary viewport overrides were reset. A screenshot of the synthetic resolved case was saved as evidence.

Before the main schema update, an opaque private SQLite backup was saved without reading account, mail configuration or credential values. The final main supervisor is running on port 3103. Support requests/history currently do not enqueue support emails; this acceptance establishes local application behaviour and persistence, not public deployment or financial settlement.

## Order lifecycle live acceptance

The production build was exercised against a separate synthetic SQLite database with outbound mail disabled. QA used `127.0.0.1:3104` to keep its browser cookies separate from the owner's `localhost:3103` session. Before any HTTP/browser request, the background worker closed one overdue booking and created one completion audit event. Thirty real HTTP checks covered actor scope, cancellation/replay/reason persistence, paused-held confirmation, unchanged other bookings, safe notification snapshots and issue creation/replies/resolution conflicts/reopening.

Browser checks covered buyer history and terminal order pages, owner cancellation with a required reason and note, café reading/replying to a buyer issue, buyer resolution/reopening, and localized history/system actors and message controls. EN/RU/KK rendering preserved the author's original message language. No real order email was submitted; provider acceptance/inbox delivery still require the separate real-inbox check.

An additional short-window booking proved that a visible pickup code disappears and the screen reloads into `not_collected` at the deadline without a manual page reload. Restarting the supervised processes preserved the cancellation, one completion event per overdue booking and the four-message conversation; the isolated outbox had zero accepted email jobs. Café issue badges and the needs-reply filter displayed two open conversations, and a successful owner reply reduced the count to one without a manual list refresh. Buyer and café document geometry had no horizontal overflow at measured 480 and 2560 CSS-pixel widths; the in-app browser clamped narrower viewport requests, so this does not establish a 390-pixel or physical-device check. Temporary viewport overrides were reset.

Before the main database's schema update, a private SQLite/photo backup was saved without inspecting account/configuration values. The updated main supervisor responds on port 3103. The background processes must remain running for automatic completion/reminders.

## Browser checks

Browser testing used a separate SQLite file and disposable QA accounts, separate from the owner's account and database.

- Existing café account signs in and opens its pending application. Publishing controls are unavailable until approval.
- Administrator signs in, selects the application and requests changes with explicit RU/KK/EN reasons and a confirmation dialog.
- Switching between English, Kazakh and Russian changes the workspace and the owner's moderation reason correctly.
- Café owner sees the reason, corrects the pickup address and submits revision 3. The application returns to the pending queue.
- Administrator approves the corrected submission. Revision 4 and its history survive a full page reload.
- Sign-out produces a guest profile. Guests see the administrator sign-in gate; buyers see a denial without the private venue queue.
- Buyer/café registration forms switch between all three languages and reveal the appropriate café fields.
- Desktop and narrow layouts have no horizontal page overflow. Local image assets load. Narrow registration and moderation were inspected at an effective 480 CSS pixels; the desktop review was inspected at 1920 CSS pixels.

The email slice was checked against a separate database on `127.0.0.1:3104`, with outbound mail explicitly disabled:

- Recovery, confirmation and reset screens switch correctly between RU/KK/EN, including failure messages.
- An unavailable mail service produces an error rather than a false successful-send message.
- Opening a synthetic email link clears its fragment and selects its language. Reloading explains how to reopen the original link.
- A guest sees a sign-in requirement before confirmation. A signed-in fixture account cannot confirm a synthetic invalid link and can request a replacement.
- Password fields have associated labels, `new-password` autocomplete and masked input. Narrow pages have no horizontal overflow at 480 CSS pixels.
- Actual HTTP responses for all three lifecycle pages use `no-referrer`, `no-store` and `noindex, nofollow`.

On the owner's application, an unverified administrator is blocked from the private moderation queue. Brevo API authentication succeeded after the owner saved the correct API key privately. The real Russian confirmation request succeeded and the application displayed that the provider accepted the message. The owner then confirmed receipt/opening and completed email confirmation. She also completed the requested real recovery check: opened its email, set a password privately, signed in again and checked the password-change notification. Browser inspection after the new sign-in showed the working administrator queue and a profile marked both Administrator and Email confirmed. No passwords, provider keys or real email capability links were read or saved to evidence.

## Running HTTP integration

The café/media slice passed on a separate SQLite file with outbound mail disabled, using the final production build and real cookie authentication. It uploaded actual files, verified guest denial for private assets, saved RU/KK/EN content and a seven-day schedule, rejected a stale revision, reviewed and approved the exact profile, then served the public DTO and WebP. It created an offer with an owned uploaded image, confirmed a buyer booking, changed the offer picture and retained the original order image. Replacing the gallery returned the café to pending, revoked anonymous image/page access and preserved the buyer's order-image access. Approval restored publication. This fixture's private contact fields never appeared in the public response.

Browser checks selected a local JPEG through the real file chooser, uploaded it, selected it for the gallery, moved it to the cover position and submitted the profile. The café became pending and new selling controls were unavailable. A separate QA administrator reviewed photos, all content languages, hours and historical snapshots, then approved the new version. The public page displayed the uploaded cover and second photo, localized text, current offer and schedule in RU/KK/EN. The gallery opened, advanced and closed successfully. Photo requests loaded without broken images. A narrow public page at an effective 480 CSS pixels and the moderation workspace at 780 CSS pixels had no horizontal page overflow; desktop editor/moderation were inspected at 2560 CSS pixels. New upload handling clears the native input after success and refreshes the private library after an uncertain response before allowing an explicit retry.

The built application on the isolated QA database passed this complete flow with real cookie authentication:

1. Approved café signs in and creates a published offer with all three translations.
2. Public catalogue and direct lookup expose the offer without private owner contacts.
3. Buyer signs in, reserves one unit and confirms a booking with payment at pickup.
4. Café looks up the pickup code and explicitly collects the order inside its pickup window.
5. Buyer history retains collected status and the original translations; available stock changes from 3 to 2.
6. Both API sessions sign out successfully.

Cookies and pickup codes remained in process memory and were not printed or saved to evidence files. The main database was not used for this flow.

## Scope limitations

The notification slice also passed a running HTTP flow against a fresh isolated database with outbound mail explicitly disabled. Before opening any QA browser, the supervised background worker generated exactly one overdue reminder from a booking confirmed earlier. Private buyer/café inboxes, another buyer's denial, guest authentication, cursor pagination, idempotent read markers, mark-all/future unread behavior, opt-out/language persistence, confirmation retries and cancellation all passed. No pickup code or other account's contact was exposed in inbox responses.

Browser verification covered the guest inbox sign-in return path, buyer/café event histories, RU/KK/EN snapshot content, read-one/read-all and unread empty state, the profile counter, saved email opt-in/language after page reload, and a guest merchant email link that preserves its canonical order UUID through sign-in and opens the correct venue-scoped booking. The inbox was inspected at 2560 CSS pixels with no horizontal page overflow; its central 480-pixel content column fits all controls and order details. The viewport override did not reliably apply to background tabs, so this run does not establish a separate narrow-device viewport test. Temporary overrides were reset.

The Node supervisor started the web server and notification worker together. Stopping the isolated supervisor stopped its web endpoint and worker; a later startup reopened the same inbox/preferences/reminder data. This validates local scheduling and queue behavior. Actual new order-email delivery to a human inbox has not been tested in this slice: transport was injected/disabled for QA, while the existing owner's real Brevo confirmation/recovery acceptance remains recorded above. New order templates need a real-booking inbox check separately from provider acceptance.

This verifies local registration, authorization, moderation, reservation and email lifecycle behaviour, plus the owner's real inbox confirmation/recovery flow. Real-inbox testing used Russian; all three template languages and interface dictionaries were verified automatically and in the browser. Delivery/link checks against a future public HTTPS origin, online payment and real food handling are outside this check. New production databases start empty; development/test startup enables fictional fixtures, while standalone/production startup does not. Existing local data must still be prepared before commercial release. Real-device accessibility, load testing, backups and other provider integrations remain separate release work. See [email delivery](email-delivery.md) for private setup and release boundaries.

## FSD and module refactor regression (2026-10-14)

The frontend dependency guard passes for the actual source tree and its positive
and negative fixtures. Strict TypeScript, ESLint, formatting and the production
build pass. All 172 automated tests pass. The suite
includes durable mutation storage, legacy pending-offer migration, nested support
payloads, unreadable/corrupt storage, completion cleanup failures and a real
committed offer whose lost response is followed by 401/403/429 and reload. That
sequence creates exactly one offer with the original payload/key. Eight resource
read tests additionally cover concurrent GET sharing, independent cancellation,
last-consumer abort, settlement/error eviction, replacement reads and invalidation
before/after successful or failed writes.

A production build was exercised on an isolated SQLite database at port 3104 with
outbound email disabled. The owner's database was not used for this regression.
The browser completed these scenarios:

- Sign in as a café owner; create an offer with distinct RU/KK/EN content and an
  owned photograph; change the price and pickup window and reopen the saved data.
- Sign in as a buyer; reserve that offer, confirm it and open the pickup ticket in
  each language with the original content and booking terms.
- Submit a support request from that order and see its persisted conversation and
  history.
- Sign in as the owner; look up the code, acknowledge handoff and collect the order.
  The terminal result prevents another handoff.
- Edit the café profile and pickup coordinates; submit the existing translations,
  seven-day schedule and gallery. The café returns to pending moderation and new
  publishing controls disappear.
- Sign in as an administrator; inspect the submitted version/photos/coordinates
  and approve that revision through the explicit decision dialog.
- Open the new support case, take assignment and record a decision with all three
  explanations. The case becomes resolved, the queue counts update and the action
  history retains assignment and resolution. Switching RU/KK/EN shows the correct
  saved explanation.

At the desktop viewport (2560 CSS pixels), the support page had no horizontal
page overflow or broken images. This run is a browser regression, not a claim of
real-device testing or a new hosted inbox check. Test-only date fields were edited
through their native accessible controls because the browser locator's date-time
fill did not change those controls.
