import type { DatabaseSync } from 'node:sqlite'

export function migrateOrderLifecycleSchema(db: DatabaseSync): void {
  const schema = (table: string) =>
    String(
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
        .get(table)?.sql,
    )
  const orders = !schema('orders').includes("'not_collected'")
  const notifications = !schema('notifications').includes(
    "'order_not_collected'",
  )
  const messages = !schema('order_issue_messages').includes("'admin'")
  if (!orders && !notifications && !messages) return
  // SQLite cannot extend a CHECK constraint in place. Keep every child FK aimed at its original table name.
  db.exec('PRAGMA foreign_keys=OFF')
  let begun = false
  try {
    db.exec('BEGIN IMMEDIATE')
    begun = true
    if (orders)
      db.exec(`
        CREATE TABLE orders_lifecycle (
          id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, buyer_id TEXT NOT NULL REFERENCES users(id),
          offer_id TEXT NOT NULL REFERENCES offers(id), venue_id TEXT NOT NULL REFERENCES venues(id), snapshot TEXT NOT NULL,
          quantity INTEGER NOT NULL CHECK(quantity>0), total INTEGER NOT NULL CHECK(total>0),
          status TEXT NOT NULL CHECK(status IN ('reserved','confirmed','collected','cancelled','expired','not_collected')),
          created_at TEXT NOT NULL, expires_at TEXT NOT NULL, pickup_code TEXT UNIQUE
        );
        INSERT INTO orders_lifecycle SELECT * FROM orders ORDER BY rowid;
        DROP TABLE orders;
        ALTER TABLE orders_lifecycle RENAME TO orders;
        CREATE INDEX orders_offer_status ON orders(offer_id,status);
        CREATE INDEX orders_buyer ON orders(buyer_id);
        CREATE INDEX orders_venue ON orders(venue_id);
      `)
    if (notifications)
      db.exec(`
        CREATE TABLE notifications_lifecycle (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), order_id TEXT NOT NULL REFERENCES orders(id),
          kind TEXT NOT NULL CHECK(kind IN ('order_confirmed','order_cancelled','order_collected','pickup_reminder','booking_confirmed','booking_cancelled','booking_collected','order_not_collected','booking_not_collected')),
          payload TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, UNIQUE(user_id,order_id,kind)
        );
        INSERT INTO notifications_lifecycle SELECT * FROM notifications ORDER BY rowid;
        DROP TABLE notifications;
        ALTER TABLE notifications_lifecycle RENAME TO notifications;
        CREATE INDEX notifications_user ON notifications(user_id,created_at DESC,id DESC);
        CREATE INDEX notifications_unread ON notifications(user_id,read_at);
      `)
    if (messages)
      db.exec(`
          CREATE TABLE order_issue_messages_lifecycle (
            id TEXT PRIMARY KEY, issue_id TEXT NOT NULL REFERENCES order_issues(id), author_id TEXT NOT NULL REFERENCES users(id),
            author_role TEXT NOT NULL CHECK(author_role IN ('buyer','cafe','admin')), author_name TEXT NOT NULL,
            body TEXT NOT NULL, created_at TEXT NOT NULL
          );
          INSERT INTO order_issue_messages_lifecycle SELECT * FROM order_issue_messages ORDER BY rowid;
          DROP TABLE order_issue_messages;
          ALTER TABLE order_issue_messages_lifecycle RENAME TO order_issue_messages;
          CREATE INDEX order_issue_messages_issue ON order_issue_messages(issue_id,created_at,id);
        `)
    if (db.prepare('PRAGMA foreign_key_check').all().length !== 0)
      throw new Error('Order lifecycle migration failed its foreign-key check.')
    db.exec('COMMIT')
    begun = false
  } catch (error) {
    if (begun) db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys=ON')
  }
}
