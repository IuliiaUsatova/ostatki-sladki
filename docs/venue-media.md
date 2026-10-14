# Café pages and photographs

## Owner workflow

The café page tab in `/merchant` loads the current venue profile and its moderation revision. The owner edits descriptions and collection instructions in Russian, Kazakh and English, a seven-day weekly schedule and an ordered gallery. The first selected image is the cover; the gallery holds up to eight photographs. Opening times use the venue's local timezone, with Monday numbered zero. Closed days are explicit. Open intervals currently stay within one day; overnight hours require a separate product decision.

Photo uploads use `POST /api/merchant/photos` with the actual JPEG, PNG or WebP file body. A saved photograph enters only the authenticated owner's library. The owner chooses where it is used: gallery or offer. New offer creation and offer edits accept owned uploaded photos. Removing a photo from the selected gallery detaches the reference; it does not erase files used by historical bookings or moderation snapshots.

`PATCH /api/merchant/profile` sends `{expectedRevision, profile}`. Runtime validation requires all three content translations, seven distinct days with valid times and at most eight owned photo IDs. The server rechecks the actor, venue ownership and email confirmation. In a SQLite transaction it compares the expected revision, saves the profile, returns moderation to pending and appends a complete immutable application snapshot. A stale editor or administrator receives a conflict and must review the latest data before retrying. The client preserves an unsaved draft until an explicit discard/reload choice.

## Public and review pages

`/venues/{id}` displays an approved café's name, address, gallery, selected-language content, opening hours and current published offers. It is linked from discovery and offer details. A missing profile has a truthful empty state. The public DTO excludes business phone, owner contacts, review reasons, revisions, history and internal gallery IDs. Pending, suspended and rejected venues do not have a public page or new sales. Existing confirmed bookings remain fulfilable.

The administrator sees current photographs, every content language, hours and details saved at each moderation revision. Approval applies to the exact current revision. Editing and resubmitting the core café application preserves its extended profile and includes it in the next snapshot.

## Media boundary

An upload requires a verified café owner and the existing same-origin mutation check. The server reads a bounded stream (6 MiB, 30 seconds), checks the declared MIME against the decoded format, rejects animation and bounds dimensions to 64–8192 pixels per side and at most 16 million source pixels. Sharp autorotates, scales to fit 1920 × 1920 without enlargement and writes WebP. The source filename is ignored; EXIF and other source metadata are not retained. Native decoding has a bounded timeout and a two-job pool with two waiting jobs. Persistent per-owner throttling allows 20 attempts per 15 minutes; a transaction enforces 40 photos and 100 MiB of stored images per venue.

Metadata lives in `photo_assets`. Files are written atomically with private permissions to `<database filename>.photos` beside the SQLite file, outside `public/`. IDs must be canonical lowercase UUIDs. File or database failures do not leave an attached asset; a failed transaction cleans its new file. The API checks current database identity and session again after asynchronous processing.

`GET /api/photos/{id}` serves a WebP only when the current actor is authorized or the current approved venue publishes that photograph in its gallery or a live offer. Unattached uploads and pending profiles remain private. A verified administrator can review the upload, the owner can inspect their own library, and buyers retain access to photos referenced by their own order snapshots. Relevant café/pickup staff retain order-image access. Every response disables storage caching and includes `Vary: Cookie`, `nosniff` and a same-origin resource policy. Access is rechecked after disk reading so a suspension or logout during that read cannot use stale permission.

## Persistence and release

The SQLite file and its companion photo directory must live on the same durable deployment volume and be backed up together. Reopening the application does not erase the profile, library or revision history. Current storage assumes one Node application. A later move to object storage needs an explicit private/public authorization policy and revocation behavior; placing this directory into a public static bucket would bypass the current checks.

The existing fictional fixture cafés retain their local design assets as a separate gallery fallback. These static assets are not private uploaded photos. Disable fixture seeding and prepare real approved businesses before commercial release. Storage retention/deletion tooling and malicious-content review beyond safe image decoding remain separate product work.
