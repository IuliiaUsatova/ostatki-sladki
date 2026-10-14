import { randomUUID } from 'node:crypto'
import { invariant } from '../domain/errors.ts'
import type {
  Locale,
  Notification,
  NotificationKind,
  NotificationPreferences,
  NotificationPreferencesResponse,
  NotificationReadResponse,
  NotificationSnapshot,
  NotificationsReadResponse,
  NotificationsResponse,
  Order,
  User,
} from '../domain/types.ts'
import {
  notificationId,
  notificationPreferencesInput,
  notificationQuery,
  notificationReadAllInput,
} from '../domain/notification-validation.ts'
import type { Repository } from './repository.ts'

const REMINDER_LEAD_MS = 30 * 60_000
type Row = Record<string, unknown>
const timestamp = (now: number) => new Date(now).toISOString()

function currentUser(repository: Repository, user: User | null): User {
  const current = user ? repository.user(user.id) : null
  invariant(
    current,
    'AUTH_REQUIRED',
    'Войдите в аккаунт, чтобы продолжить.',
    401,
  )
  return current
}

export function notificationPreferences(
  repository: Repository,
  user: User,
): NotificationPreferences {
  const current = currentUser(repository, user)
  const row = repository.db
    .prepare(
      'SELECT email_enabled,locale FROM notification_preferences WHERE user_id=?',
    )
    .get(current.id) as Row | undefined
  return row
    ? { emailEnabled: row.email_enabled === 1, locale: row.locale as Locale }
    : {
        emailEnabled:
          !!current.email &&
          current.emailVerified === true &&
          (current.role === 'buyer' || current.role === 'cafe'),
        locale: current.locale ?? 'ru',
      }
}

export function getNotificationPreferences(
  repository: Repository,
  user: User | null,
  now: number,
): NotificationPreferencesResponse {
  const current = currentUser(repository, user)
  return {
    preferences: notificationPreferences(repository, current),
    serverNow: timestamp(now),
  }
}

export function updateNotificationPreferences(
  repository: Repository,
  user: User | null,
  value: unknown,
  now: number,
): NotificationPreferencesResponse {
  const input = notificationPreferencesInput(value)
  return repository.transaction(() => {
    const current = currentUser(repository, user)
    if (input.emailEnabled) {
      invariant(
        current.email && current.emailVerified,
        'EMAIL_NOT_VERIFIED',
        'Подтвердите email, чтобы включить письма.',
        403,
      )
      invariant(
        current.role === 'buyer' || current.role === 'cafe',
        'FORBIDDEN',
        'Письма о заказах доступны покупателям и владельцам кафе.',
        403,
      )
    }
    repository.db
      .prepare(
        `INSERT INTO notification_preferences VALUES (?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET email_enabled=excluded.email_enabled,locale=excluded.locale`,
      )
      .run(current.id, Number(input.emailEnabled), input.locale)
    if (!input.emailEnabled)
      repository.db
        .prepare(
          `UPDATE email_outbox SET status='skipped',last_error_code='OPTED_OUT'
          WHERE user_id=? AND status='pending'`,
        )
        .run(current.id)
    return { preferences: input, serverNow: timestamp(now) }
  })
}

function snapshot(order: Order): NotificationSnapshot {
  return {
    orderId: order.id,
    orderNumber: order.number,
    venueName: order.snapshot.venueName,
    address: order.snapshot.address,
    translations: order.snapshot.translations,
    quantity: order.quantity,
    total: order.total,
    pickupStart: order.snapshot.pickupStart,
    pickupEnd: order.snapshot.pickupEnd,
    ...(order.cancellation
      ? {
          cancellation: {
            source: order.cancellation.source,
            reason: order.cancellation.reason,
          },
        }
      : {}),
  }
}

/** Caller already holds the order transaction: the event and its mail job must commit together. */
function createNotification(
  repository: Repository,
  userId: string,
  order: Order,
  kind: NotificationKind,
  now: number,
): boolean {
  const user = repository.user(userId)
  if (!user) return false
  const id = randomUUID()
  const payload = JSON.stringify(snapshot(order))
  const inserted = repository.db
    .prepare(
      `INSERT INTO notifications VALUES (?,?,?,?,?,?,NULL)
      ON CONFLICT(user_id,order_id,kind) DO NOTHING`,
    )
    .run(id, user.id, order.id, kind, payload, timestamp(now))
  if (Number(inserted.changes) !== 1) return false
  const preferences = notificationPreferences(repository, user)
  if (
    user.email &&
    user.emailVerified &&
    (user.role === 'buyer' || user.role === 'cafe') &&
    preferences.emailEnabled
  )
    repository.db
      .prepare(
        `INSERT INTO email_outbox
        (id,notification_id,user_id,order_id,kind,locale,payload,status,attempts,next_attempt_at)
        VALUES (?,?,?,?,?,?,?,'pending',0,?)`,
      )
      .run(
        randomUUID(),
        id,
        user.id,
        order.id,
        kind,
        preferences.locale,
        payload,
        now,
      )
  return true
}

function suppressObsoleteEmails(repository: Repository, orderId: string): void {
  repository.db
    .prepare(
      `UPDATE email_outbox SET status='skipped',last_error_code='ORDER_STATE_CHANGED'
      WHERE order_id=? AND status='pending' AND kind IN ('order_confirmed','booking_confirmed','pickup_reminder')`,
    )
    .run(orderId)
}

function stopReminder(
  repository: Repository,
  orderId: string,
  now: number,
): void {
  repository.db
    .prepare(
      `UPDATE pickup_reminders SET status='cancelled',processed_at=?
      WHERE order_id=? AND status='scheduled'`,
    )
    .run(now, orderId)
  suppressObsoleteEmails(repository, orderId)
}

function generateReminder(
  repository: Repository,
  orderId: string,
  now: number,
): boolean {
  const order = repository.order(orderId)
  if (!order || order.status !== 'confirmed') {
    repository.db
      .prepare(
        `UPDATE pickup_reminders SET status='cancelled',processed_at=? WHERE order_id=? AND status='scheduled'`,
      )
      .run(now, orderId)
    return false
  }
  if (now >= Date.parse(order.snapshot.pickupEnd)) {
    repository.db
      .prepare(
        `UPDATE pickup_reminders SET status='skipped',processed_at=? WHERE order_id=? AND status='scheduled'`,
      )
      .run(now, orderId)
    return false
  }
  const confirmation = repository.db
    .prepare(
      "SELECT created_at FROM notifications WHERE user_id=? AND order_id=? AND kind='order_confirmed'",
    )
    .get(order.buyerId, order.id)
  const due = Date.parse(order.snapshot.pickupStart) - REMINDER_LEAD_MS
  if (!confirmation || Date.parse(String(confirmation.created_at)) >= due) {
    repository.db
      .prepare(
        `UPDATE pickup_reminders SET status='skipped',processed_at=? WHERE order_id=? AND status='scheduled'`,
      )
      .run(now, orderId)
    return false
  }
  const created = createNotification(
    repository,
    order.buyerId,
    order,
    'pickup_reminder',
    now,
  )
  repository.db
    .prepare(
      `UPDATE pickup_reminders SET status='generated',processed_at=? WHERE order_id=? AND status='scheduled'`,
    )
    .run(now, orderId)
  return created
}

export function recordOrderNotifications(
  repository: Repository,
  order: Order,
  event: 'confirmed' | 'cancelled' | 'collected' | 'not_collected',
  now: number,
): void {
  const buyerKind: NotificationKind = `order_${event}`
  const ownerKind: NotificationKind = `booking_${event}`
  createNotification(repository, order.buyerId, order, buyerKind, now)
  const owners = repository.db
    .prepare("SELECT id FROM users WHERE role='cafe' AND venue_id=?")
    .all(order.venueId) as Row[]
  for (const owner of owners)
    createNotification(repository, String(owner.id), order, ownerKind, now)
  if (event === 'confirmed') {
    const due = Date.parse(order.snapshot.pickupStart) - REMINDER_LEAD_MS
    repository.db
      .prepare(
        'INSERT INTO pickup_reminders VALUES (?,?,?,?) ON CONFLICT(order_id) DO NOTHING',
      )
      .run(
        order.id,
        due,
        due <= now ? 'skipped' : 'scheduled',
        due <= now ? now : null,
      )
  } else stopReminder(repository, order.id, now)
}

/** Bounded durable scheduler; a later tick continues any larger backlog. */
export function generateDueReminders(
  repository: Repository,
  now: number,
): number {
  return repository.transaction(() => {
    const rows = repository.db
      .prepare(
        "SELECT order_id FROM pickup_reminders WHERE status='scheduled' AND due_at<=? ORDER BY due_at,order_id LIMIT 100",
      )
      .all(now) as Row[]
    let created = 0
    for (const row of rows)
      if (generateReminder(repository, String(row.order_id), now)) created++
    return created
  })
}

function fromRow(row: Row): Notification {
  return {
    id: String(row.id),
    kind: row.kind as NotificationKind,
    payload: JSON.parse(String(row.payload)) as NotificationSnapshot,
    createdAt: String(row.created_at),
    readAt: row.read_at === null ? null : String(row.read_at),
    emailStatus: (row.email_status ?? null) as Notification['emailStatus'],
  }
}

function unreadCount(repository: Repository, userId: string): number {
  return Number(
    repository.db
      .prepare(
        'SELECT COUNT(*) AS count FROM notifications WHERE user_id=? AND read_at IS NULL',
      )
      .get(userId)?.count,
  )
}

export function listNotifications(
  repository: Repository,
  user: User | null,
  value: unknown,
  now: number,
): NotificationsResponse {
  const current = currentUser(repository, user)
  const query = notificationQuery(value)
  const clauses = ['n.user_id=?']
  const params: Array<string | number> = [current.id]
  if (query.filter === 'unread') clauses.push('n.read_at IS NULL')
  if (query.cursor) {
    clauses.push('(n.created_at<? OR (n.created_at=? AND n.id<?))')
    params.push(query.cursor.createdAt, query.cursor.createdAt, query.cursor.id)
  }
  params.push(query.limit + 1)
  const rows = repository.db
    .prepare(
      `SELECT n.*,o.status AS email_status FROM notifications n
      LEFT JOIN email_outbox o ON o.notification_id=n.id
      WHERE ${clauses.join(' AND ')} ORDER BY n.created_at DESC,n.id DESC LIMIT ?`,
    )
    .all(...params) as Row[]
  const notifications = rows.slice(0, query.limit).map(fromRow)
  const last = notifications.at(-1)
  const nextCursor =
    rows.length > query.limit && last
      ? Buffer.from(
          JSON.stringify({
            createdAt: last.createdAt,
            id: last.id,
            filter: query.filter,
          }),
        ).toString('base64url')
      : null
  return {
    notifications,
    unreadCount: unreadCount(repository, current.id),
    nextCursor,
    serverNow: timestamp(now),
  }
}

export function readNotification(
  repository: Repository,
  user: User | null,
  id: unknown,
  now: number,
): NotificationReadResponse {
  const validId = notificationId(id)
  return repository.transaction(() => {
    const current = currentUser(repository, user)
    const changed = repository.db
      .prepare(
        'UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?',
      )
      .run(timestamp(now), validId, current.id)
    invariant(
      Number(changed.changes) === 1,
      'NOTIFICATION_NOT_FOUND',
      'Уведомление не найдено.',
      404,
    )
    const row = repository.db
      .prepare(
        'SELECT n.*,o.status AS email_status FROM notifications n LEFT JOIN email_outbox o ON o.notification_id=n.id WHERE n.id=? AND n.user_id=?',
      )
      .get(validId, current.id) as Row
    return {
      notification: fromRow(row),
      unreadCount: unreadCount(repository, current.id),
      serverNow: timestamp(now),
    }
  })
}

export function readAllNotifications(
  repository: Repository,
  user: User | null,
  value: unknown,
  now: number,
): NotificationsReadResponse {
  notificationReadAllInput(value)
  return repository.transaction(() => {
    const current = currentUser(repository, user)
    repository.db
      .prepare(
        'UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL',
      )
      .run(timestamp(now), current.id)
    return {
      unreadCount: unreadCount(repository, current.id),
      serverNow: timestamp(now),
    }
  })
}
