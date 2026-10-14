import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import {
  createNotificationWorker,
  MAX_NOTIFICATION_ATTEMPTS,
  NOTIFICATION_LEASE_MS,
} from '../src/server/notification-worker.ts'
import { OrderMailError } from '../src/server/order-mail.ts'
import type { OrderMail, OrderMailer } from '../src/server/order-mail.ts'
import { updateNotificationPreferences } from '../src/server/notifications.ts'

const INITIAL_TIME = Date.parse('2026-10-11T12:00:00Z')
function fixture(path = ':memory:') {
  let now = INITIAL_TIME
  const repository = new Repository(path, now, { seedFixtures: true })
  for (const id of ['alina', 'yerlan']) {
    repository.db
      .prepare('INSERT INTO credentials VALUES (?,?,?,?,?)')
      .run(
        id,
        `${id}@example.invalid`,
        'unused-test-hash',
        'en',
        new Date(now).toISOString(),
      )
    repository.db
      .prepare('INSERT INTO auth_state(user_id,verified_at) VALUES (?,?)')
      .run(id, now)
  }
  repository.db
    .prepare(
      "UPDATE offers SET pickup_start=?,pickup_end=? WHERE id='goa-surprise'",
    )
    .run(
      new Date(now + 60 * 60_000).toISOString(),
      new Date(now + 120 * 60_000).toISOString(),
    )
  const service = new MarketplaceService(repository, () => now)
  const buyer = () => repository.user('alina')!
  const order = service.reserve(buyer(), {
    offerId: 'goa-surprise',
    quantity: 1,
    idempotencyKey: randomUUID(),
  }).order
  service.confirm(buyer(), order.id, { idempotencyKey: randomUUID() })
  const messages: OrderMail[] = []
  const mailer: OrderMailer = {
    assertReady() {},
    async send(message) {
      messages.push(message)
    },
  }
  return {
    repository,
    service,
    buyer,
    order: repository.order(order.id)!,
    messages,
    mailer,
    clock: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds
    },
  }
}
const statuses = (repository: Repository) =>
  repository.db
    .prepare(
      'SELECT status,attempts,last_error_code,accepted_at FROM email_outbox ORDER BY user_id',
    )
    .all()

test('worker accepts buyer and café jobs sequentially without leaking private data in tick results', async () => {
  const f = fixture()
  try {
    let active = 0
    let peak = 0
    const worker = createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: {
        assertReady() {},
        async send(message) {
          active++
          peak = Math.max(peak, active)
          await Promise.resolve()
          f.messages.push(message)
          active--
        },
      },
    })
    const result = await worker.tick()
    assert.equal(result.accepted, 2)
    assert.equal(result.claimed, 2)
    assert.equal(peak, 1)
    assert.deepEqual(f.messages.map((message) => message.kind).sort(), [
      'booking_confirmed',
      'order_confirmed',
    ])
    assert.equal(
      statuses(f.repository).every(
        (row) => row.status === 'accepted' && row.accepted_at,
      ),
      true,
    )
    assert.doesNotMatch(
      JSON.stringify(result),
      /example.invalid|user_id|orderId|lease|payload|0142/,
    )
    assert.equal((await worker.tick()).claimed, 0)
  } finally {
    f.repository.close()
  }
})

test('timeout retries use bounded backoff and preserve the event key and language captured when queued', async () => {
  const f = fixture()
  try {
    f.repository.db
      .prepare("DELETE FROM email_outbox WHERE user_id='yerlan'")
      .run()
    let failures = 1
    const worker = createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: {
        assertReady() {},
        async send(message) {
          f.messages.push(message)
          if (failures-- > 0) throw new OrderMailError('MAIL_TIMEOUT', true)
        },
      },
    })
    assert.equal((await worker.tick()).retried, 1)
    const row = f.repository.db.prepare('SELECT * FROM email_outbox').get()!
    assert.equal(row.status, 'pending')
    assert.equal(row.next_attempt_at, INITIAL_TIME + 30_000)
    assert.equal((await worker.tick()).claimed, 0)
    updateNotificationPreferences(
      f.repository,
      f.buyer(),
      { emailEnabled: true, locale: 'kk' },
      f.clock(),
    )
    f.advance(30_000)
    assert.equal((await worker.tick()).accepted, 1)
    assert.equal(f.messages[0].idempotencyKey, f.messages[1].idempotencyKey)
    assert.equal(f.messages[1].locale, 'en')
  } finally {
    f.repository.close()
  }
})

test('permanent rejections stop immediately and transient failures stop at the bounded attempt limit', async () => {
  for (const permanent of [true, false]) {
    const f = fixture()
    try {
      f.repository.db
        .prepare("DELETE FROM email_outbox WHERE user_id='yerlan'")
        .run()
      const worker = createNotificationWorker(f.repository, {
        clock: f.clock,
        mailer: {
          assertReady() {},
          async send() {
            throw new OrderMailError(
              permanent ? 'MAIL_REJECTED' : 'MAIL_RATE_LIMIT',
              !permanent,
            )
          },
        },
      })
      for (
        let attempt = 1;
        attempt <= (permanent ? 1 : MAX_NOTIFICATION_ATTEMPTS);
        attempt++
      ) {
        await worker.tick()
        const row = f.repository.db.prepare('SELECT * FROM email_outbox').get()!
        assert.equal(row.attempts, attempt)
        assert.equal(
          row.status,
          permanent || attempt === MAX_NOTIFICATION_ATTEMPTS
            ? 'failed'
            : 'pending',
        )
        if (row.status === 'pending')
          f.advance(Number(row.next_attempt_at) - f.clock())
      }
      assert.equal((await worker.tick()).claimed, 0)
    } finally {
      f.repository.close()
    }
  }
})

test('missing configuration leaves jobs queued without consuming attempts or pretending acceptance', async () => {
  const f = fixture()
  try {
    let sent = false
    const result = await createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: {
        assertReady() {
          throw new Error('private settings')
        },
        async send() {
          sent = true
        },
      },
    }).tick()
    assert.equal(result.configurationUnavailable, true)
    assert.equal(result.claimed, 0)
    assert.equal(sent, false)
    assert.equal(
      statuses(f.repository).every(
        (row) => row.status === 'pending' && row.attempts === 0,
      ),
      true,
    )
    assert.doesNotMatch(JSON.stringify(result), /private settings/)
  } finally {
    f.repository.close()
  }
})

test('an expired crash lease is normalized even without mail configuration, while a live lease is preserved', async () => {
  const f = fixture()
  try {
    f.repository.db
      .prepare(
        "UPDATE email_outbox SET status='processing',attempts=1,lease_token='crashed',lease_until=? WHERE user_id='alina'",
      )
      .run(f.clock() - 1)
    f.repository.db
      .prepare(
        "UPDATE email_outbox SET status='processing',attempts=1,lease_token='live',lease_until=? WHERE user_id='yerlan'",
      )
      .run(f.clock() + NOTIFICATION_LEASE_MS)
    const worker = createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: {
        assertReady() {
          throw new OrderMailError('MAIL_CONFIG', true)
        },
        async send() {
          assert.fail('Mail must not be sent')
        },
      },
    })
    const result = await worker.tick()
    assert.equal(result.configurationUnavailable, true)
    assert.equal(result.claimed, 0)
    const rows = f.repository.db
      .prepare('SELECT * FROM email_outbox ORDER BY user_id')
      .all()
    assert.equal(rows[0].status, 'pending')
    assert.equal(rows[0].attempts, 1)
    assert.equal(rows[0].lease_token, null)
    assert.equal(rows[1].status, 'processing')
    assert.equal(rows[1].lease_token, 'live')
    f.repository.db
      .prepare("UPDATE email_outbox SET attempts=? WHERE user_id='alina'")
      .run(MAX_NOTIFICATION_ATTEMPTS)
    assert.equal((await worker.tick()).failed, 1)
    assert.equal(statuses(f.repository)[0].status, 'failed')
  } finally {
    f.repository.close()
  }
})

test('configuration disappearing after readiness pauses a job without exhausting delivery attempts', async () => {
  const f = fixture()
  try {
    f.repository.db
      .prepare("DELETE FROM email_outbox WHERE user_id='yerlan'")
      .run()
    const result = await createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: {
        assertReady() {},
        async send() {
          throw new OrderMailError('MAIL_CONFIG', true)
        },
      },
    }).tick()
    assert.equal(result.retried, 1)
    const row = f.repository.db.prepare('SELECT * FROM email_outbox').get()!
    assert.equal(row.status, 'pending')
    assert.equal(row.attempts, 0)
    assert.equal(row.next_attempt_at, f.clock() + 60_000)
    f.advance(60_000)
    assert.equal(
      (
        await createNotificationWorker(f.repository, {
          clock: f.clock,
          mailer: f.mailer,
        }).tick()
      ).accepted,
      1,
    )
  } finally {
    f.repository.close()
  }
})

test('current order state, verification and opt-out suppress stale confirmation jobs before dispatch', async () => {
  for (const state of [
    'cancelled',
    'collected',
    'expired',
    'unverified',
    'opted-out',
  ] as const) {
    const f = fixture()
    try {
      f.repository.db
        .prepare("DELETE FROM email_outbox WHERE user_id='yerlan'")
        .run()
      if (state === 'unverified')
        f.repository.db
          .prepare(
            "UPDATE auth_state SET verified_at=NULL WHERE user_id='alina'",
          )
          .run()
      else if (state === 'opted-out') {
        f.repository.db
          .prepare(
            "UPDATE email_outbox SET status='processing',lease_token='crashed',lease_until=?",
          )
          .run(f.clock() - 1)
        updateNotificationPreferences(
          f.repository,
          f.buyer(),
          { emailEnabled: false, locale: 'en' },
          f.clock(),
        )
      } else if (state === 'expired') f.advance(121 * 60_000)
      else
        f.repository.db
          .prepare('UPDATE orders SET status=? WHERE id=?')
          .run(state, f.order.id)
      const result = await createNotificationWorker(f.repository, {
        clock: f.clock,
        mailer: f.mailer,
      }).tick()
      if (state === 'expired') {
        assert.equal(result.closedOrders, 1)
        assert.deepEqual(f.messages.map((message) => message.kind).sort(), [
          'booking_not_collected',
          'order_not_collected',
        ])
      } else {
        assert.equal(result.skipped, 1, state)
        assert.equal(f.messages.length, 0, state)
      }
      assert.equal(
        f.repository.db
          .prepare(
            "SELECT status FROM email_outbox WHERE kind='order_confirmed'",
          )
          .get()?.status,
        'skipped',
      )
    } finally {
      f.repository.close()
    }
  }
})

test('due reminders are generated once by background ticks, expire safely and remain suppressed after cancellation', async () => {
  const f = fixture()
  try {
    const worker = createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: f.mailer,
    })
    await worker.tick()
    f.advance(30 * 60_000)
    const due = await worker.tick()
    assert.equal(due.reminders, 1)
    assert.equal(due.accepted, 1)
    assert.equal(
      f.messages.filter((message) => message.kind === 'pickup_reminder').length,
      1,
    )
    assert.equal((await worker.tick()).reminders, 0)
    f.service.cancel(f.buyer(), f.order.id)
    const cancelled = await worker.tick()
    assert.equal(cancelled.accepted, 2)
    assert.deepEqual(
      f.messages
        .slice(-2)
        .map((message) => message.kind)
        .sort(),
      ['booking_cancelled', 'order_cancelled'],
    )
  } finally {
    f.repository.close()
  }
  const expired = fixture()
  try {
    expired.advance(120 * 60_000)
    const result = await createNotificationWorker(expired.repository, {
      clock: expired.clock,
      mailer: expired.mailer,
    }).tick()
    assert.equal(result.reminders, 0)
    assert.equal(result.closedOrders, 1)
    assert.deepEqual(expired.messages.map((message) => message.kind).sort(), [
      'booking_not_collected',
      'order_not_collected',
    ])
    assert.equal(
      expired.repository.order(expired.order.id)?.status,
      'not_collected',
    )
  } finally {
    expired.repository.close()
  }
})

test('background completion runs at the original pickup end even when mail is unconfigured and survives reopening without duplicates', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'ostatki-order-end-'))
  const path = join(folder, 'isolated.sqlite')
  const f = fixture(path)
  const end = Date.parse(f.order.snapshot.pickupEnd)
  const stock = f.repository.offer(f.order.offerId)!.available
  const missing: OrderMailer = {
    assertReady() {
      throw new OrderMailError('MAIL_CONFIG', true)
    },
    async send() {
      assert.fail('No mail without configuration')
    },
  }
  try {
    f.repository.db
      .prepare('UPDATE offers SET pickup_end=? WHERE id=?')
      .run(new Date(end + 60 * 60_000).toISOString(), f.order.offerId)
    f.advance(120 * 60_000 - 1)
    const worker = createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: missing,
    })
    assert.equal((await worker.tick()).closedOrders, 0)
    assert.equal(f.repository.order(f.order.id)?.status, 'confirmed')
    f.advance(1)
    const result = await worker.tick()
    assert.equal(result.closedOrders, 1)
    assert.equal(result.configurationUnavailable, true)
    assert.equal(f.repository.offer(f.order.offerId)!.available, stock)
    assert.equal(f.repository.order(f.order.id)?.pickupCode, f.order.pickupCode)
    assert.equal((await worker.tick()).closedOrders, 0)
    assert.equal(
      f.repository
        .order(f.order.id)
        ?.events.filter((event) => event.type === 'not_collected').length,
      1,
    )
    assert.equal(
      Number(
        f.repository.db
          .prepare(
            "SELECT COUNT(*) AS count FROM notifications WHERE order_id=? AND kind IN ('order_not_collected','booking_not_collected')",
          )
          .get(f.order.id)?.count,
      ),
      2,
    )
  } finally {
    f.repository.close()
  }
  const reopened = new Repository(path, end + 1, { seedFixtures: true })
  try {
    const messages: OrderMail[] = []
    const result = await createNotificationWorker(reopened, {
      clock: () => end + 1,
      mailer: {
        assertReady() {},
        async send(value) {
          messages.push(value)
        },
      },
    }).tick()
    assert.equal(result.closedOrders, 0)
    assert.deepEqual(messages.map((value) => value.kind).sort(), [
      'booking_not_collected',
      'order_not_collected',
    ])
    assert.equal(reopened.offer(f.order.offerId)!.available, stock)
  } finally {
    reopened.close()
    rmSync(folder, { recursive: true, force: true })
  }
})

test('the process admits one active tick; changes after dispatch cannot recall a provider-accepted message', async () => {
  const f = fixture()
  try {
    let release!: () => void
    let entered!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const worker = createNotificationWorker(f.repository, {
      clock: f.clock,
      batchSize: 1,
      mailer: {
        assertReady() {},
        async send() {
          entered()
          await waiting
        },
      },
    })
    const first = worker.tick()
    await started
    const second = await createNotificationWorker(f.repository, {
      clock: f.clock,
      mailer: f.mailer,
    }).tick()
    assert.equal(second.skippedBusy, true)
    assert.equal(second.claimed, 0)
    f.service.cancel(f.buyer(), f.order.id)
    release()
    assert.equal((await first).accepted, 1)
    assert.equal(
      statuses(f.repository).filter((row) => row.status === 'accepted').length,
      1,
    )
  } finally {
    f.repository.close()
  }
})

test('expired leases are reclaimed after reopening SQLite, while obsolete lease owners cannot acknowledge', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'ostatki-mail-lease-'))
  const path = join(directory, 'test.sqlite')
  const f = fixture(path)
  let reopened: Repository | undefined
  let peer: Repository | undefined
  try {
    f.repository.db
      .prepare("DELETE FROM email_outbox WHERE user_id='yerlan'")
      .run()
    f.repository.db
      .prepare(
        "UPDATE email_outbox SET status='processing',lease_token='crashed-worker',lease_until=?,attempts=1",
      )
      .run(f.clock() + NOTIFICATION_LEASE_MS)
    f.repository.close()
    reopened = new Repository(path, f.clock(), { seedFixtures: true })
    peer = new Repository(path, f.clock(), { seedFixtures: true })
    const worker = createNotificationWorker(reopened, {
      clock: f.clock,
      mailer: {
        assertReady() {},
        async send(message) {
          f.messages.push(message)
          peer!.transaction(() =>
            peer!.db
              .prepare(
                "UPDATE email_outbox SET lease_token='new-worker',lease_until=? WHERE id=?",
              )
              .run(f.clock() + NOTIFICATION_LEASE_MS, message.idempotencyKey),
          )
        },
      },
    })
    assert.equal((await worker.tick()).claimed, 0)
    f.advance(NOTIFICATION_LEASE_MS)
    const lost = await worker.tick()
    assert.equal(lost.claimed, 1)
    assert.equal(lost.accepted, 0)
    assert.equal(
      reopened.db.prepare('SELECT lease_token FROM email_outbox').get()!
        .lease_token,
      'new-worker',
    )
    f.advance(NOTIFICATION_LEASE_MS)
    const retry = await createNotificationWorker(reopened, {
      clock: f.clock,
      mailer: f.mailer,
    }).tick()
    assert.equal(retry.accepted, 1)
    assert.equal(f.messages[0].idempotencyKey, f.messages[1].idempotencyKey)
    assert.equal(statuses(reopened)[0].attempts, 3)
  } finally {
    reopened?.close()
    peer?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
