import type { DatabaseSync } from 'node:sqlite'

export function createSchema(db: DatabaseSync): void {
  db.exec(`
      CREATE TABLE IF NOT EXISTS venues (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('approved','pending')), timezone TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('buyer','cafe','pickup')),
        venue_id TEXT REFERENCES venues(id)
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pickup_shifts (
        user_id TEXT PRIMARY KEY REFERENCES users(id), venue_id TEXT NOT NULL REFERENCES venues(id),
        starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offers (
        id TEXT PRIMARY KEY, venue_id TEXT NOT NULL REFERENCES venues(id), kind TEXT NOT NULL CHECK(kind IN ('specific_item','surprise_bag')),
        price INTEGER NOT NULL CHECK(price > 0), original_price INTEGER NOT NULL CHECK(original_price >= price),
        total_quantity INTEGER NOT NULL CHECK(total_quantity >= 0), image TEXT NOT NULL,
        pickup_start TEXT NOT NULL, pickup_end TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('published','paused')),
        distance_km REAL NOT NULL, translations TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, buyer_id TEXT NOT NULL REFERENCES users(id),
        offer_id TEXT NOT NULL REFERENCES offers(id), venue_id TEXT NOT NULL REFERENCES venues(id), snapshot TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity > 0), total INTEGER NOT NULL CHECK(total > 0),
        status TEXT NOT NULL CHECK(status IN ('reserved','confirmed','collected','cancelled','expired','not_collected')),
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL, pickup_code TEXT UNIQUE
      );
      CREATE TABLE IF NOT EXISTS order_events (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), type TEXT NOT NULL,
        at TEXT NOT NULL, actor_name TEXT NOT NULL, message TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        actor_id TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL, action TEXT NOT NULL,
        payload_hash TEXT NOT NULL, resource_id TEXT NOT NULL, PRIMARY KEY(actor_id,key)
      );
      CREATE INDEX IF NOT EXISTS orders_offer_status ON orders(offer_id,status);
      CREATE INDEX IF NOT EXISTS orders_buyer ON orders(buyer_id);
      CREATE INDEX IF NOT EXISTS orders_venue ON orders(venue_id);
      CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id), email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale IN ('ru','kk','en')), created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_state (
        user_id TEXT PRIMARY KEY REFERENCES credentials(user_id),
        verified_at INTEGER, credential_revision INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS auth_tokens (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES credentials(user_id),
        purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','reset_password')),
        credential_revision INTEGER NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_tokens_user ON auth_tokens(user_id,purpose,created_at);
      CREATE INDEX IF NOT EXISTS auth_tokens_expiry ON auth_tokens(expires_at);
      CREATE TABLE IF NOT EXISTS auth_mail_requests (
        purpose TEXT NOT NULL, email_hash TEXT NOT NULL, requested_at INTEGER NOT NULL,
        PRIMARY KEY(purpose,email_hash)
      );
      CREATE TABLE IF NOT EXISTS admin_grants (
        user_id TEXT PRIMARY KEY REFERENCES users(id), granted_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_attempts (
        action TEXT NOT NULL, email_hash TEXT NOT NULL, count INTEGER NOT NULL,
        window_start INTEGER NOT NULL, PRIMARY KEY(action,email_hash)
      );
      CREATE TABLE IF NOT EXISTS venue_moderation (
        venue_id TEXT PRIMARY KEY REFERENCES venues(id),
        status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','changes_requested','suspended')),
        description TEXT NOT NULL, contact_phone TEXT NOT NULL, revision INTEGER NOT NULL,
        submitted_at TEXT NOT NULL, updated_at TEXT NOT NULL, reasons TEXT,
        reviewed_at TEXT, reviewed_by TEXT REFERENCES users(id)
      );
      CREATE TABLE IF NOT EXISTS moderation_events (
        id TEXT PRIMARY KEY, venue_id TEXT NOT NULL REFERENCES venues(id),
        action TEXT NOT NULL, at TEXT NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id),
        actor_name TEXT NOT NULL, revision INTEGER NOT NULL, reasons TEXT, snapshot TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS moderation_events_venue ON moderation_events(venue_id,revision);
      CREATE TABLE IF NOT EXISTS venue_profiles (
        venue_id TEXT PRIMARY KEY REFERENCES venues(id), content TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS photo_assets (
        id TEXT PRIMARY KEY, venue_id TEXT NOT NULL REFERENCES venues(id), owner_id TEXT NOT NULL REFERENCES users(id),
        mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS photo_assets_venue ON photo_assets(venue_id,owner_id,created_at);
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        email_enabled INTEGER NOT NULL CHECK(email_enabled IN (0,1)),
        locale TEXT NOT NULL CHECK(locale IN ('ru','kk','en'))
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), order_id TEXT NOT NULL REFERENCES orders(id),
        kind TEXT NOT NULL CHECK(kind IN ('order_confirmed','order_cancelled','order_collected','pickup_reminder','booking_confirmed','booking_cancelled','booking_collected','order_not_collected','booking_not_collected')),
        payload TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
        UNIQUE(user_id,order_id,kind)
      );
      CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS notifications_unread ON notifications(user_id,read_at);
      CREATE TABLE IF NOT EXISTS email_outbox (
        id TEXT PRIMARY KEY, notification_id TEXT NOT NULL UNIQUE REFERENCES notifications(id),
        user_id TEXT NOT NULL REFERENCES users(id), order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL,
        locale TEXT NOT NULL CHECK(locale IN ('ru','kk','en')), payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','processing','accepted','failed','skipped')),
        attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
        lease_token TEXT, lease_until INTEGER, accepted_at TEXT, last_error_code TEXT
      );
      CREATE INDEX IF NOT EXISTS email_outbox_due ON email_outbox(status,next_attempt_at,lease_until);
      CREATE TABLE IF NOT EXISTS pickup_reminders (
        order_id TEXT PRIMARY KEY REFERENCES orders(id), due_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('scheduled','generated','cancelled','skipped')), processed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS pickup_reminders_due ON pickup_reminders(status,due_at);
      CREATE TABLE IF NOT EXISTS order_cancellations (
        order_id TEXT PRIMARY KEY REFERENCES orders(id), source TEXT NOT NULL CHECK(source IN ('buyer','cafe')),
        reason TEXT CHECK(reason IN ('unavailable','closed','quality_issue','other')), note TEXT NOT NULL, at TEXT NOT NULL,
        CHECK((source='buyer' AND reason IS NULL) OR (source='cafe' AND reason IS NOT NULL))
      );
      CREATE TABLE IF NOT EXISTS order_issues (
        id TEXT PRIMARY KEY, order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
        category TEXT NOT NULL CHECK(category IN ('pickup_problem','food_problem','cancellation','other')),
        status TEXT NOT NULL CHECK(status IN ('open','answered','resolved')), revision INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS order_issue_messages (
        id TEXT PRIMARY KEY, issue_id TEXT NOT NULL REFERENCES order_issues(id), author_id TEXT NOT NULL REFERENCES users(id),
        author_role TEXT NOT NULL CHECK(author_role IN ('buyer','cafe','admin')), author_name TEXT NOT NULL,
        body TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS order_issue_messages_issue ON order_issue_messages(issue_id,created_at,id);
      CREATE TABLE IF NOT EXISTS support_cases (
        id TEXT PRIMARY KEY, issue_id TEXT NOT NULL UNIQUE REFERENCES order_issues(id),
        kind TEXT NOT NULL CHECK(kind IN ('help','complaint')), status TEXT NOT NULL CHECK(status IN ('new','in_review','waiting','resolved')),
        revision INTEGER NOT NULL, reporter_name TEXT NOT NULL, reporter_role TEXT NOT NULL CHECK(reporter_role IN ('buyer','cafe')),
        assignee_id TEXT REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolution TEXT
      );
      CREATE INDEX IF NOT EXISTS support_cases_queue ON support_cases(updated_at DESC,id DESC);
      CREATE INDEX IF NOT EXISTS support_cases_status ON support_cases(status,assignee_id,kind);
      CREATE TABLE IF NOT EXISTS support_events (
        id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES support_cases(id), event TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS support_events_case ON support_events(case_id);
    `)
}
