# Email delivery and account lifecycle

## Status

The application implements email confirmation and password recovery, with localized HTML/text messages through Brevo. Provider authentication and the owner's actual Russian inbox confirmation/recovery flow have succeeded. The owner entered the new password privately and completed the requested notification check. The new sign-in was inspected in the browser: administrator access remained available and the profile displayed Email confirmed. Automated lifecycle and injected-transport checks also cover all three languages; a future public origin still needs its own inbox/link checks.

Brevo was selected for its free plan. Check the current allowance in the account and the [official pricing page](https://www.brevo.com/pricing/) before sending beyond the included plan. The application does not subscribe to a paid plan or automatically increase capacity.

## Private local setup

1. Sign in to Brevo and select the free plan. Confirm the sender email in the provider account. Create a key in **SMTP & API → API keys & MCP**, not the SMTP tab. Brevo's current API format starts with the public prefix `xkeysib-`; the setup script rejects the SMTP format `xsmtpsib-` before saving. The sender must be accepted by Brevo; an arbitrary address entered into this app does not establish that permission.
2. Open your own Terminal in the project folder and run:

   ```sh
   python3 scripts/setup-email.py
   ```

3. Enter the confirmed sender email, the application origin and the API key when prompted. The key input is hidden. For the current local application, accept `http://localhost:3103`.
4. The script writes `data/email-settings.json` with private file permissions. The whole `data/` directory is excluded from Git. If settings already exist, the script asks before replacing them. Do not open this file in chat, attach it to a report or print its contents.

For a deployed service, inject `BREVO_API_KEY`, `OSTATKI_MAIL_FROM` and `OSTATKI_PUBLIC_ORIGIN` through the hosting provider's secret/configuration mechanism. These override the local private settings. Never send keys or passwords in chat or pass the API key on a command line. This setup uses no real environment file in the repository.

The origin must be exactly an HTTPS origin without a path, credentials, query, fragment or trailing slash. HTTP is accepted only for `localhost`, `127.0.0.1` or loopback IPv6. Non-loopback delivery additionally requires the exact `OSTATKI_PUBLIC_ORIGIN` environment setting; saving a hosted origin in the JSON alone is insufficient because HTTP mutation checks and Secure cookies use the runtime origin.

Localhost links work only in a browser on the computer running the application. Opening them on a phone or another computer points to that device's own localhost. For external users, deploy the Node application with HTTPS and use its public origin.

## User flows

- Registration saves the account even if email submission fails. The signed-in user sees the delivery state and can request another confirmation.
- Confirmation links last 24 hours. Sign in to the account you created first, then reopen the link from the email and press the confirmation button. A different account cannot consume it. Simply opening the link does not confirm anything.
- Successful confirmation closes every session for that account. Sign in again to continue. An administrator grant does not bypass email confirmation.
- Recovery is available at `/forgot-password`. After valid provider configuration, the response is the same for known/unknown addresses, cooldowns and mail submission failures. “Request received” does not promise delivery or disclose account existence.
- Reset links last 30 minutes. Choose a 15–128-character password and repeat it. A successful reset confirms mailbox ownership, invalidates other outstanding links and closes every account session. Sign in with the new password; the app does not sign you in automatically.
- A password-change notification is attempted after the reset has committed. Failure of that notification cannot revert the new password.

Confirmation, recovery and notification emails support Russian, Kazakh and English. Confirmation/reset links carry the requested language in the fragment; the user can still change it on the page. Capability tokens are also in the fragment, read into client memory once and immediately removed from the address bar. Reloading requires reopening the original email link. Never share such links: they authorize an account operation.

## Delivery and failure behavior

The transport submits transactional emails to [Brevo's HTTPS API](https://developers.brevo.com/reference/send-transac-email) with a four-second timeout, rejects redirects and requires the expected provider success status. A successful submission means the provider accepted it, not that it arrived in the recipient inbox.

Brevo processes the recipient address, localized content and confirmation/reset links. The provider may rewrite links. The owner successfully used both local Russian confirmation/reset links. Public-hosted links still need their own checks after deployment.

Configuration absence or invalid trusted origin returns `MAIL_UNAVAILABLE`. A verification submission outage also reports failure; the previously saved account and older successfully submitted links remain available. Requests have shared/recipient rate limits and a 60-second purpose cooldown. Configured recovery waits before returning the generic acknowledgement, including unknown recipients or provider failure.

Each eligible security-email request makes one provider submission. These confirmation/recovery/password-change flows do not have automatic retries or a durable outbox. If no message arrives, check the inbox/spam folder and provider delivery status, wait for the cooldown, then make another request. Provider response bodies and private delivery links are not propagated into app errors/logs.

Order email has a separate durable outbox, background retries, pickup reminders and recipient opt-out. It reuses the same private Brevo sender/settings without changing the account lifecycle. See [order notifications](order-notifications.md). A provider acceptance record does not establish inbox delivery for either flow.

## Real-inbox acceptance check

After provider setup, the account owner should complete these checks herself without sharing passwords or email links:

1. Sign in, open `/verify-email` and request a confirmation in the selected language. Check the actual inbox and spam folder.
2. Open the email link on the computer running the app, confirm in the matching account and verify that a new sign-in is required.
3. Request recovery, check the new message, open its link and set a password privately. Confirm that the new password works and the old one no longer does.
4. Check the password-change notification and repeat the visible message/language checks for RU/KK/EN when needed.

Report only the outcome or an error label. Do not send the API key, passwords, cookies or full email URLs. A successful mocked/injected transport test cannot substitute for this check.

### Order emails and reminders — completed local check

The 13 October 2026 acceptance run delivered 15 actual order messages to the owner's Gmail Inbox, using only a separate temporary database and self-addressed Gmail plus variants. Buyer/café confirmations and buyer reminders were checked in RU/KK/EN; cancellation, collection and missed pickup messages were checked for both roles. The reminder ran on real wall time after a process restart. Collection and missed-pickup boundaries used the isolated service clock. All received messages matched their unique persisted job keys; none were in Spam and none included the actual pickup code. See [verification](verification.md#real-order-mail-inbox-acceptance).

Order-detail links still require a matching signed-in account. The notification-settings link opens `/profile#email-updates` and preserves that exact destination through sign-in. This local check does not validate a future public hostname, another recipient provider, or general delivery reliability. Repeat the inbox and link checks against the final public HTTPS origin before shared real usage.

## Public release prerequisites

Use a Node host with a durable database volume; set `OSTATKI_DATABASE_FILE` to persistent storage if needed. Disable development fixture seeding and prepare a clean database with real venues: pointing to an empty file currently recreates the fixtures. Configure the exact public HTTPS `OSTATKI_PUBLIC_ORIGIN`, confirmed sender and provider credentials privately, then check delivery using that public origin. Set up migrations and backups before allowing shared real usage. Stateless Workers or independent replicas cannot use this local SQLite design unchanged.
