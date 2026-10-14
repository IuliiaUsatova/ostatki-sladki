import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DomainError } from '../src/domain/errors.ts'
import type { User } from '../src/shared/api/contracts.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { SEED_USERS } from '../src/server/seed.ts'
import { generateDueReminders } from '../src/server/notifications.ts'
import { GET as getInbox } from '../src/app/api/notifications/route.ts'
import { PATCH as readOne } from '../src/app/api/notifications/[id]/read/route.ts'
import { PATCH as readAll } from '../src/app/api/notifications/read/route.ts'
import {
  GET as getPreferences,
  PATCH as patchPreferences,
} from '../src/app/api/notification-preferences/route.ts'

const NOW = Date.parse('2026-10-11T12:00:00.000Z')
const MINUTE = 60_000
const code = (expected: string) => (error: unknown) =>
  error instanceof DomainError && error.code === expected

function fixture(path = ':memory:', registered = true) {
  let now = NOW
  const repository = new Repository(path, now, { seedFixtures: true })
  if (registered) {
    for (const persona of [
      'buyer',
      'buyer-other',
      'cafe',
      'cafe-other',
    ] as const) {
      const user = SEED_USERS[persona]
      repository.db
        .prepare('INSERT OR IGNORE INTO credentials VALUES (?,?,?,?,?)')
        .run(
          user.id,
          `${persona}@example.invalid`,
          'isolated-notification-fixture',
          persona === 'cafe' ? 'kk' : 'en',
          new Date(now).toISOString(),
        )
      repository.db
        .prepare('INSERT OR IGNORE INTO auth_state VALUES (?,?,1)')
        .run(user.id, now)
    }
  }
  repository.db
    .prepare('UPDATE offers SET pickup_start=?,pickup_end=? WHERE id=?')
    .run(
      new Date(NOW + 60 * MINUTE).toISOString(),
      new Date(NOW + 120 * MINUTE).toISOString(),
      'goa-surprise',
    )
  const service = new MarketplaceService(repository, () => now, {
    allowPersonaSessions: !registered,
  })
  return {
    repository,
    service,
    get buyer() {
      return repository.user(SEED_USERS.buyer.id)!
    },
    get cafe() {
      return repository.user(SEED_USERS.cafe.id)!
    },
    get other() {
      return repository.user(SEED_USERS['buyer-other'].id)!
    },
    get pickup() {
      return repository.user(SEED_USERS.pickup.id)!
    },
    get now() {
      return now
    },
    setTime: (value: number) => {
      now = value
    },
  }
}

type Fixture = ReturnType<typeof fixture>
function count(
  f: Fixture,
  table: 'notifications' | 'email_outbox' | 'pickup_reminders',
): number {
  return Number(
    f.repository.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()
      ?.count,
  )
}
function reserve(f: Fixture, key: string) {
  return f.service.reserve(f.buyer, {
    offerId: 'goa-surprise',
    quantity: 1,
    idempotencyKey: `reserve-${key}`,
  }).order
}
function confirm(f: Fixture, key: string) {
  const order = reserve(f, key)
  return f.service.confirm(f.buyer, order.id, {
    idempotencyKey: `confirm-${key}`,
  }).order
}
function notifications(f: Fixture, user = f.buyer) {
  return f.service.notifications(user, {}).notifications
}

test('temporary reservations, released holds and expired holds do not create inbox or mail noise', () => {
  const f = fixture()
  try {
    const cancelled = reserve(f, 'temporary-cancel')
    f.service.cancel(f.buyer, cancelled.id)
    const expired = reserve(f, 'temporary-expire')
    f.setTime(NOW + 5 * MINUTE)
    assert.equal(
      f.service.getOrder(f.buyer, expired.id).order.status,
      'expired',
    )
    assert.equal(count(f, 'notifications'), 0)
    assert.equal(count(f, 'email_outbox'), 0)
    assert.equal(count(f, 'pickup_reminders'), 0)
  } finally {
    f.repository.close()
  }
})

test('confirmed orders commit one buyer and one owner notification with immutable safe localized snapshots and unique mail jobs', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'confirmed')
    const buyer = notifications(f)[0]
    const owner = notifications(f, f.cafe)[0]
    assert.equal(buyer.kind, 'order_confirmed')
    assert.equal(owner.kind, 'booking_confirmed')
    assert.deepEqual(buyer.payload, {
      orderId: order.id,
      orderNumber: order.number,
      venueName: order.snapshot.venueName,
      address: order.snapshot.address,
      translations: order.snapshot.translations,
      quantity: order.quantity,
      total: order.total,
      pickupStart: order.snapshot.pickupStart,
      pickupEnd: order.snapshot.pickupEnd,
    })
    assert.deepEqual(buyer.payload, owner.payload)
    assert.equal(buyer.emailStatus, 'pending')
    assert.equal(count(f, 'notifications'), 2)
    assert.equal(count(f, 'email_outbox'), 2)
    assert.equal(count(f, 'pickup_reminders'), 1)
    const text = JSON.stringify(notifications(f))
    for (const secret of [
      'pickupCode',
      order.pickupCode!,
      f.buyer.email!,
      f.cafe.email!,
      'buyerId',
      'user_id',
      'lease_token',
    ])
      assert.ok(!text.includes(secret))
    f.service.confirm(f.buyer, order.id, {
      idempotencyKey: 'confirm-confirmed',
    })
    assert.equal(count(f, 'notifications'), 2)
    assert.equal(count(f, 'email_outbox'), 2)
    assert.equal(count(f, 'pickup_reminders'), 1)
    f.service.patchOffer(f.cafe, 'goa-surprise', { price: 2000 })
    f.repository.db
      .prepare('UPDATE venues SET name=?,address=? WHERE id=?')
      .run('Changed café', 'Different address', 'goa-food')
    assert.deepEqual(notifications(f)[0].payload, buyer.payload)
  } finally {
    f.repository.close()
  }
})

test('an outbox persistence failure rolls back confirmation, pickup code, stock event, inbox and idempotency together', () => {
  const f = fixture()
  try {
    const order = reserve(f, 'rollback')
    f.repository.db.exec(
      `CREATE TRIGGER fail_notification_job BEFORE INSERT ON email_outbox BEGIN SELECT RAISE(ABORT,'fixture outbox unavailable'); END`,
    )
    assert.throws(() =>
      f.service.confirm(f.buyer, order.id, {
        idempotencyKey: 'confirm-rollback',
      }),
    )
    const unchanged = f.service.getOrder(f.buyer, order.id).order
    assert.equal(unchanged.status, 'reserved')
    assert.equal(unchanged.pickupCode, null)
    assert.deepEqual(
      unchanged.events.map((event) => event.type),
      ['reserved'],
    )
    assert.equal(count(f, 'notifications'), 0)
    assert.equal(count(f, 'email_outbox'), 0)
    assert.equal(count(f, 'pickup_reminders'), 0)
    assert.equal(
      f.repository.db
        .prepare(
          "SELECT COUNT(*) AS count FROM idempotency WHERE action='confirm'",
        )
        .get()?.count,
      0,
    )
    f.repository.db.exec('DROP TRIGGER fail_notification_job')
    f.service.confirm(f.buyer, order.id, { idempotencyKey: 'confirm-rollback' })
    assert.equal(count(f, 'notifications'), 2)
  } finally {
    f.repository.close()
  }
})

test('cancelling a confirmed order notifies both parties once and suppresses obsolete pending confirmations and reminders', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'cancelled')
    f.service.cancel(f.buyer, order.id)
    f.service.cancel(f.buyer, order.id)
    assert.deepEqual(
      new Set(notifications(f).map((item) => item.kind)),
      new Set(['order_confirmed', 'order_cancelled']),
    )
    assert.deepEqual(
      new Set(notifications(f, f.cafe).map((item) => item.kind)),
      new Set(['booking_confirmed', 'booking_cancelled']),
    )
    assert.equal(count(f, 'notifications'), 4)
    assert.equal(
      notifications(f).find((item) => item.kind === 'order_confirmed')
        ?.emailStatus,
      'skipped',
    )
    assert.equal(
      notifications(f).find((item) => item.kind === 'order_cancelled')
        ?.emailStatus,
      'pending',
    )
    assert.equal(
      f.repository.db
        .prepare('SELECT status FROM pickup_reminders WHERE order_id=?')
        .get(order.id)?.status,
      'cancelled',
    )
    f.setTime(NOW + 30 * MINUTE)
    assert.equal(generateDueReminders(f.repository, f.now), 0)
    assert.equal(count(f, 'notifications'), 4)
  } finally {
    f.repository.close()
  }
})

test('collection emits distinct completion notifications exactly once and prevents later reminder generation', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'collected')
    f.setTime(NOW + 60 * MINUTE)
    const input = {
      code: order.pickupCode,
      idempotencyKey: 'collect-notification-order',
    }
    f.service.collect(f.cafe, input)
    f.service.collect(f.cafe, input)
    assert.equal(
      notifications(f).filter((item) => item.kind === 'order_collected').length,
      1,
    )
    assert.equal(
      notifications(f, f.cafe).filter(
        (item) => item.kind === 'booking_collected',
      ).length,
      1,
    )
    assert.equal(count(f, 'notifications'), 4)
    assert.equal(generateDueReminders(f.repository, f.now), 0)
    assert.equal(
      f.repository.db
        .prepare('SELECT status FROM pickup_reminders WHERE order_id=?')
        .get(order.id)?.status,
      'cancelled',
    )
  } finally {
    f.repository.close()
  }
})

test('reminders materialize exactly at the durable due boundary once and survive venue suspension for existing fulfillment', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'reminder')
    assert.equal(generateDueReminders(f.repository, NOW + 30 * MINUTE - 1), 0)
    f.repository.db
      .prepare(
        "UPDATE venue_moderation SET status='suspended' WHERE venue_id='goa-food'",
      )
      .run()
    assert.equal(generateDueReminders(f.repository, NOW + 30 * MINUTE), 1)
    assert.equal(generateDueReminders(f.repository, NOW + 30 * MINUTE + 1), 0)
    const reminder = notifications(f).find(
      (item) => item.kind === 'pickup_reminder',
    )!
    assert.equal(reminder.createdAt, new Date(NOW + 30 * MINUTE).toISOString())
    assert.equal(reminder.payload.orderId, order.id)
    assert.equal(reminder.emailStatus, 'pending')
    assert.equal(notifications(f, f.cafe).length, 1)
    assert.equal(count(f, 'email_outbox'), 3)
  } finally {
    f.repository.close()
  }
})

test('late confirmation does not send a second immediate reminder; recovery at or beyond pickup end skips stale reminders', () => {
  for (const startMinutes of [30, 29]) {
    const f = fixture()
    try {
      f.service.patchOffer(f.cafe, 'goa-surprise', {
        pickupStart: new Date(NOW + startMinutes * MINUTE).toISOString(),
      })
      const order = confirm(f, `late-${startMinutes}`)
      assert.equal(count(f, 'notifications'), 2)
      assert.equal(generateDueReminders(f.repository, NOW + 10 * MINUTE), 0)
      assert.equal(
        f.repository.db
          .prepare('SELECT status FROM pickup_reminders WHERE order_id=?')
          .get(order.id)?.status,
        'skipped',
      )
    } finally {
      f.repository.close()
    }
  }
  for (const pastEnd of [0, 1]) {
    const f = fixture()
    try {
      const order = confirm(f, `stale-${pastEnd}`)
      assert.equal(
        generateDueReminders(
          f.repository,
          Date.parse(order.snapshot.pickupEnd) + pastEnd,
        ),
        0,
      )
      assert.equal(count(f, 'notifications'), 2)
      assert.equal(
        f.repository.db
          .prepare('SELECT status FROM pickup_reminders WHERE order_id=?')
          .get(order.id)?.status,
        'skipped',
      )
    } finally {
      f.repository.close()
    }
  }
})

test('preferences enforce fresh mailbox proof, locale validation, opt-out and future-only opt-in without removing inbox history', () => {
  const f = fixture()
  try {
    assert.deepEqual(f.service.notificationPreferences(f.buyer).preferences, {
      emailEnabled: true,
      locale: 'en',
    })
    assert.deepEqual(f.service.notificationPreferences(f.cafe).preferences, {
      emailEnabled: true,
      locale: 'kk',
    })
    const order = confirm(f, 'preferences')
    f.service.updateNotificationPreferences(f.buyer, {
      emailEnabled: false,
      locale: 'ru',
    })
    assert.equal(notifications(f)[0].emailStatus, 'skipped')
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id=?')
      .run(f.buyer.id)
    assert.throws(
      () =>
        f.service.updateNotificationPreferences(
          { ...f.buyer, emailVerified: true },
          { emailEnabled: true, locale: 'en' },
        ),
      code('EMAIL_NOT_VERIFIED'),
    )
    assert.deepEqual(
      f.service.updateNotificationPreferences(f.buyer, {
        emailEnabled: false,
        locale: 'kk',
      }).preferences,
      { emailEnabled: false, locale: 'kk' },
    )
    assert.equal(f.service.notifications(f.buyer, {}).unreadCount, 1)
    for (const input of [
      { emailEnabled: 'true', locale: 'en' },
      { emailEnabled: true, locale: 'de' },
      { emailEnabled: false },
      { emailEnabled: false, locale: 'ru', userId: f.cafe.id },
    ])
      assert.throws(
        () => f.service.updateNotificationPreferences(f.buyer, input),
        code('INVALID_INPUT'),
      )
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=? WHERE user_id=?')
      .run(NOW, f.buyer.id)
    f.service.updateNotificationPreferences(f.buyer, {
      emailEnabled: true,
      locale: 'kk',
    })
    assert.equal(notifications(f)[0].emailStatus, 'skipped')
    f.service.cancel(f.buyer, order.id)
    assert.equal(
      notifications(f).find((item) => item.kind === 'order_cancelled')
        ?.emailStatus,
      'pending',
    )
    assert.equal(
      f.repository.db
        .prepare(
          "SELECT locale FROM email_outbox WHERE user_id=? AND kind='order_cancelled'",
        )
        .get(f.buyer.id)?.locale,
      'kk',
    )
  } finally {
    f.repository.close()
  }
})

test('fixture personas without credentials keep inbox events but never receive email jobs or email-enabled defaults', () => {
  const f = fixture(':memory:', false)
  try {
    confirm(f, 'no-credentials')
    assert.equal(count(f, 'notifications'), 2)
    assert.equal(count(f, 'email_outbox'), 0)
    assert.deepEqual(f.service.notificationPreferences(f.buyer).preferences, {
      emailEnabled: false,
      locale: 'ru',
    })
    assert.throws(
      () =>
        f.service.updateNotificationPreferences(f.buyer, {
          emailEnabled: true,
          locale: 'ru',
        }),
      code('EMAIL_NOT_VERIFIED'),
    )
  } finally {
    f.repository.close()
  }
})

test('bounded cursor pagination, unread filtering and idempotent reads stay owner-scoped; mark-all never reads future events', () => {
  const f = fixture()
  try {
    for (let i = 0; i < 4; i++) confirm(f, `page-${i}`)
    let cursor: string | null = null
    const seen = new Set<string>()
    do {
      const page = f.service.notifications(f.buyer, {
        limit: '1',
        ...(cursor ? { cursor } : {}),
      })
      assert.equal(page.notifications.length, 1)
      assert.equal(page.unreadCount, 4)
      assert.ok(!seen.has(page.notifications[0].id))
      seen.add(page.notifications[0].id)
      cursor = page.nextCursor
    } while (cursor)
    assert.equal(seen.size, 4)
    const first = notifications(f)[0]
    assert.throws(
      () => f.service.readNotification(f.other, first.id),
      code('NOTIFICATION_NOT_FOUND'),
    )
    f.repository.db
      .prepare('INSERT INTO admin_grants VALUES (?,?)')
      .run(f.other.id, new Date(NOW).toISOString())
    assert.equal(f.service.notifications(f.other, {}).notifications.length, 0)
    assert.throws(
      () => f.service.readNotification(f.other, first.id),
      code('NOTIFICATION_NOT_FOUND'),
    )
    const read = f.service.readNotification(f.buyer, first.id)
    f.setTime(NOW + MINUTE)
    assert.equal(
      f.service.readNotification(f.buyer, first.id).notification.readAt,
      read.notification.readAt,
    )
    assert.equal(
      f.service.notifications(f.buyer, { filter: 'unread' }).notifications
        .length,
      3,
    )
    const unreadPage = f.service.notifications(f.buyer, {
      filter: 'unread',
      limit: '1',
    })
    assert.throws(
      () =>
        f.service.notifications(f.buyer, {
          filter: 'all',
          cursor: unreadPage.nextCursor,
        }),
      code('INVALID_INPUT'),
    )
    for (const input of [
      { limit: '0' },
      { limit: '51' },
      { limit: '01' },
      { cursor: '..' },
      { filter: 'other' },
      { ownerId: f.cafe.id },
    ])
      assert.throws(
        () => f.service.notifications(f.buyer, input),
        code('INVALID_INPUT'),
      )
    assert.throws(
      () => f.service.readAllNotifications(f.buyer, { userId: f.cafe.id }),
      code('INVALID_INPUT'),
    )
    assert.equal(f.service.readAllNotifications(f.buyer, {}).unreadCount, 0)
    assert.equal(f.service.notifications(f.cafe, {}).unreadCount, 4)
    confirm(f, 'after-mark-all')
    assert.equal(
      f.service.notifications(f.buyer, { filter: 'unread' }).notifications
        .length,
      1,
    )
  } finally {
    f.repository.close()
  }
})

test('inbox, preferences, outbox and scheduled reminders survive reopen and separate schedulers cannot duplicate a reminder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-notification-'))
  const path = join(dir, 'notifications.sqlite')
  let first: Repository | undefined, second: Repository | undefined
  try {
    const f = fixture(path)
    first = f.repository
    const order = confirm(f, 'persisted')
    f.service.updateNotificationPreferences(f.buyer, {
      emailEnabled: true,
      locale: 'kk',
    })
    f.service.readNotification(f.buyer, notifications(f)[0].id)
    const buyer = f.buyer
    first.close()
    first = new Repository(path, NOW, { seedFixtures: true })
    const service = new MarketplaceService(first, () => NOW)
    assert.equal(service.notifications(buyer, {}).unreadCount, 0)
    assert.equal(
      service.notificationPreferences(buyer).preferences.locale,
      'kk',
    )
    assert.equal(
      first.db.prepare('SELECT COUNT(*) AS count FROM email_outbox').get()
        ?.count,
      2,
    )
    second = new Repository(path, NOW, { seedFixtures: true })
    assert.equal(generateDueReminders(first, NOW + 30 * MINUTE), 1)
    assert.equal(generateDueReminders(second, NOW + 30 * MINUTE), 0)
    assert.equal(
      first.db
        .prepare(
          "SELECT COUNT(*) AS count FROM notifications WHERE order_id=? AND kind='pickup_reminder'",
        )
        .get(order.id)?.count,
      1,
    )
    assert.equal(
      first.db
        .prepare(
          "SELECT COUNT(*) AS count FROM email_outbox WHERE order_id=? AND kind='pickup_reminder'",
        )
        .get(order.id)?.count,
      1,
    )
  } finally {
    first?.close()
    second?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

function session(f: Fixture, user: User): string {
  const token = randomBytes(32).toString('base64url')
  f.repository.db
    .prepare('INSERT INTO sessions VALUES (?,?,?)')
    .run(
      createHash('sha256').update(token).digest('hex'),
      user.id,
      NOW + 24 * 60 * MINUTE,
    )
  return token
}

test('actual inbox routes enforce auth, Origin, private response headers and revocation during slow JSON bodies', async () => {
  const f = fixture()
  const runtime = globalThis as typeof globalThis & {
    ostatkiService?: MarketplaceService
  }
  const previous = runtime.ostatkiService
  runtime.ostatkiService = f.service
  try {
    confirm(f, 'http')
    assert.equal(
      (await getInbox(new Request('https://food.example/api/notifications')))
        .status,
      401,
    )
    const token = session(f, f.buyer)
    const headers = {
      cookie: `ostatki_session=${token}`,
      origin: 'https://food.example',
      'content-type': 'application/json',
    }
    const response = await getInbox(
      new Request(
        'https://food.example/api/notifications?filter=unread&limit=1',
        { headers },
      ),
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('vary'), 'Cookie')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    for (const query of ['?limit=1&limit=2', '?userId=someone', '?filter=read'])
      assert.equal(
        (
          await getInbox(
            new Request(`https://food.example/api/notifications${query}`, {
              headers,
            }),
          )
        ).status,
        400,
      )
    assert.equal(
      (
        await getPreferences(
          new Request('https://food.example/api/notification-preferences', {
            headers,
          }),
        )
      ).status,
      200,
    )
    const id = notifications(f)[0].id
    assert.equal(
      (
        await readOne(
          new Request(`https://food.example/api/notifications/${id}/read`, {
            method: 'PATCH',
            headers: { ...headers, origin: 'https://evil.example' },
          }),
          { params: Promise.resolve({ id }) },
        )
      ).status,
      403,
    )
    const otherToken = session(f, f.other)
    assert.equal(
      (
        await readOne(
          new Request(`https://food.example/api/notifications/${id}/read`, {
            method: 'PATCH',
            headers: { ...headers, cookie: `ostatki_session=${otherToken}` },
          }),
          { params: Promise.resolve({ id }) },
        )
      ).status,
      404,
    )
    for (const item of [
      {
        path: '/api/notification-preferences',
        handler: patchPreferences,
        input: { emailEnabled: false, locale: 'kk' },
      },
      { path: '/api/notifications/read', handler: readAll, input: {} },
    ]) {
      const currentToken = session(f, f.buyer)
      let release!: () => void, started!: () => void
      const waiting = new Promise<void>((resolve) => {
        release = resolve
      })
      const reading = new Promise<void>((resolve) => {
        started = resolve
      })
      const body = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            started()
            await waiting
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(item.input)),
            )
            controller.close()
          },
        },
        { highWaterMark: 0 },
      )
      const pending = item.handler(
        new Request(`https://food.example${item.path}`, {
          method: 'PATCH',
          headers: { ...headers, cookie: `ostatki_session=${currentToken}` },
          body,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
      )
      await reading
      f.service.deleteSession(currentToken)
      const before = f.repository.db
        .prepare('SELECT total_changes() AS count')
        .get()?.count
      release()
      const rejected = await pending
      assert.equal(rejected.status, 401)
      assert.equal((await rejected.json()).error.code, 'AUTH_REQUIRED')
      assert.equal(
        f.repository.db.prepare('SELECT total_changes() AS count').get()?.count,
        before,
      )
    }
    assert.equal(f.service.notifications(f.buyer, {}).unreadCount, 1)
    assert.equal(
      f.service.notificationPreferences(f.buyer).preferences.emailEnabled,
      true,
    )
  } finally {
    if (previous === undefined) delete runtime.ostatkiService
    else runtime.ostatkiService = previous
    f.repository.close()
  }
})
