import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DomainError } from '../src/domain/errors.ts'
import type { User } from '../src/shared/api/contracts.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { SEED_USERS } from '../src/server/seed.ts'
import { finalizeUncollectedOrders } from '../src/server/order-lifecycle.ts'
import { POST as cancelRoute } from '../src/app/api/merchant/orders/[id]/cancel/route.ts'
import {
  GET as issueGet,
  POST as issuePost,
} from '../src/app/api/orders/[id]/issue/route.ts'
import { POST as messagePost } from '../src/app/api/orders/[id]/issue/messages/route.ts'
import { POST as resolvePost } from '../src/app/api/orders/[id]/issue/resolve/route.ts'

const NOW = Date.parse('2026-10-12T12:00:00.000Z')
const MINUTE = 60_000
const code = (expected: string) => (error: unknown) =>
  error instanceof DomainError && error.code === expected

function fixture(path = ':memory:') {
  let now = NOW
  const repository = new Repository(path, now, { seedFixtures: true })
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
        'unused-lifecycle-fixture',
        'en',
        new Date(NOW).toISOString(),
      )
    repository.db
      .prepare('INSERT OR IGNORE INTO auth_state VALUES (?,?,1)')
      .run(user.id, NOW)
  }
  repository.db
    .prepare(
      "UPDATE offers SET pickup_start=?,pickup_end=? WHERE id='goa-surprise'",
    )
    .run(
      new Date(NOW + 30 * MINUTE).toISOString(),
      new Date(NOW + 60 * MINUTE).toISOString(),
    )
  const service = new MarketplaceService(repository, () => now)
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
    get foreignCafe() {
      return repository.user(SEED_USERS['cafe-other'].id)!
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
const cancelInput = (key: string) => ({
  reason: 'unavailable',
  note: '',
  idempotencyKey: `cafe-cancel-${key}`,
})
const issueInput = (key: string) => ({
  category: 'pickup_problem',
  message: 'Please help me with this pickup.',
  idempotencyKey: `open-issue-${key}`,
})

test('not-collected closes at the original exact end once, retains the code and never restores committed stock after offer extension', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'deadline')
    f.service.patchOffer(f.cafe, 'goa-surprise', {
      pickupEnd: new Date(NOW + 120 * MINUTE).toISOString(),
    })
    f.repository.db
      .prepare(
        "UPDATE venue_moderation SET status='suspended' WHERE venue_id='goa-food'",
      )
      .run()
    assert.equal(
      finalizeUncollectedOrders(f.repository, NOW + 60 * MINUTE - 1),
      0,
    )
    assert.equal(finalizeUncollectedOrders(f.repository, NOW + 60 * MINUTE), 1)
    assert.equal(finalizeUncollectedOrders(f.repository, NOW + 61 * MINUTE), 0)
    const closed = f.repository.order(order.id)!
    assert.equal(closed.status, 'not_collected')
    assert.equal(closed.pickupCode, order.pickupCode)
    assert.equal(f.repository.orderByCode(order.pickupCode!)?.id, order.id)
    assert.equal(
      closed.events.filter((event) => event.type === 'not_collected').length,
      1,
    )
    assert.equal(closed.events.at(-1)?.at, order.snapshot.pickupEnd)
    assert.equal(f.repository.offer('goa-surprise')?.available, 7)
    const jobs = f.repository.db
      .prepare(
        "SELECT kind FROM notifications WHERE order_id=? AND kind LIKE '%not_collected'",
      )
      .all(order.id)
    assert.deepEqual(jobs.map((row) => row.kind).sort(), [
      'booking_not_collected',
      'order_not_collected',
    ])
    f.setTime(NOW + 61 * MINUTE)
    assert.throws(
      () =>
        f.service.collect(f.cafe, {
          code: order.pickupCode,
          idempotencyKey: 'collect-terminal-code',
        }),
      code('OUTSIDE_PICKUP_WINDOW'),
    )
    assert.equal(
      f.service.confirm(f.buyer, order.id, {
        idempotencyKey: 'confirm-deadline',
      }).order.status,
      'not_collected',
    )
    assert.throws(
      () => f.service.patchOffer(f.cafe, 'goa-surprise', { totalQuantity: 0 }),
      code('VENUE_PENDING'),
    )
    f.repository.db
      .prepare(
        "UPDATE venue_moderation SET status='approved' WHERE venue_id='goa-food'",
      )
      .run()
    assert.throws(
      () => f.service.patchOffer(f.cafe, 'goa-surprise', { totalQuantity: 0 }),
      code('CAPACITY_BELOW_COMMITTED'),
    )
  } finally {
    f.repository.close()
  }
})

test('service reads close overdue orders; bounded independent workers drain once and collected/cancelled/hold orders are excluded', () => {
  const f = fixture()
  try {
    const first = confirm(f, 'batch-1'),
      second = confirm(f, 'batch-2'),
      third = confirm(f, 'batch-3')
    const cancelled = confirm(f, 'batch-cancel')
    f.service.cancel(f.buyer, cancelled.id)
    const collected = confirm(f, 'batch-collect')
    f.setTime(NOW + 30 * MINUTE)
    f.service.collect(f.cafe, {
      code: collected.pickupCode,
      idempotencyKey: 'collect-batch-order',
    })
    assert.equal(
      finalizeUncollectedOrders(f.repository, NOW + 60 * MINUTE, 1),
      1,
    )
    assert.equal(
      finalizeUncollectedOrders(f.repository, NOW + 60 * MINUTE, 1),
      1,
    )
    f.setTime(NOW + 60 * MINUTE)
    assert.equal(
      f.service
        .listOrders(f.buyer)
        .orders.filter((order) => order.status === 'not_collected').length,
      3,
    )
    assert.equal(finalizeUncollectedOrders(f.repository, f.now), 0)
    for (const order of [first, second, third])
      assert.equal(f.repository.order(order.id)?.status, 'not_collected')
    assert.equal(f.repository.order(cancelled.id)?.status, 'cancelled')
    assert.equal(f.repository.order(collected.id)?.status, 'collected')
    assert.throws(
      () => finalizeUncollectedOrders(f.repository, f.now, 0),
      code('INVALID_INPUT'),
    )
  } finally {
    f.repository.close()
  }
})

test('café cancellation before or during original pickup atomically pauses the source offer, records a reason and leaves other confirmed orders fulfillable', () => {
  for (const duringPickup of [false, true]) {
    const f = fixture()
    try {
      const first = confirm(f, `cafe-first-${duringPickup}`),
        second = confirm(f, `cafe-second-${duringPickup}`),
        hold = reserve(f, `cafe-hold-${duringPickup}`)
      if (duringPickup) f.setTime(NOW + 30 * MINUTE)
      const input = {
        reason: 'other',
        note: 'The collection counter is unavailable.',
        idempotencyKey: `cafe-reason-${duringPickup}`,
      }
      const cancelled = f.service.merchantCancelOrder(
        f.cafe,
        first.id,
        input,
      ).order
      assert.equal(cancelled.status, 'cancelled')
      assert.deepEqual(cancelled.cancellation, {
        source: 'cafe',
        reason: 'other',
        note: input.note,
        at: new Date(f.now).toISOString(),
      })
      assert.equal(cancelled.pickupCode, first.pickupCode)
      assert.equal(f.repository.offer('goa-surprise')?.status, 'paused')
      assert.equal(f.repository.order(second.id)?.status, 'confirmed')
      f.service.merchantCancelOrder(f.cafe, first.id, input)
      assert.equal(
        f.repository
          .order(first.id)
          ?.events.filter((event) => event.type === 'cancelled').length,
        1,
      )
      assert.equal(
        f.repository.db
          .prepare(
            "SELECT COUNT(*) AS count FROM notifications WHERE order_id=? AND kind IN ('order_cancelled','booking_cancelled')",
          )
          .get(first.id)?.count,
        2,
      )
      const notificationPayloads = f.repository.db
        .prepare(
          "SELECT payload FROM notifications WHERE order_id=? AND kind IN ('order_cancelled','booking_cancelled')",
        )
        .all(first.id)
      for (const row of notificationPayloads) {
        const payload = JSON.parse(String(row.payload))
        assert.deepEqual(payload.cancellation, {
          source: 'cafe',
          reason: 'other',
        })
        assert.ok(!String(row.payload).includes(input.note))
      }
      assert.throws(
        () =>
          f.service.merchantCancelOrder(f.cafe, first.id, {
            ...input,
            note: 'A different reason text.',
          }),
        code('IDEMPOTENCY_CONFLICT'),
      )
      // Confirming a held portion after this automatic pause cannot create another booking.
      if (!duringPickup)
        assert.throws(
          () =>
            f.service.confirm(f.buyer, hold.id, {
              idempotencyKey: 'confirm-paused-held-order',
            }),
          code('OFFER_UNAVAILABLE'),
        )
      f.setTime(NOW + 30 * MINUTE)
      assert.equal(
        f.service.collect(f.cafe, {
          code: second.pickupCode,
          idempotencyKey: 'collect-other-booking',
        }).order.status,
        'collected',
      )
      assert.throws(
        () =>
          f.service.collect(f.cafe, {
            code: first.pickupCode,
            idempotencyKey: 'collect-cancelled-booking',
          }),
        code('ORDER_STATE_CONFLICT'),
      )
      assert.throws(
        () =>
          f.service.confirm(f.buyer, first.id, {
            idempotencyKey: 'confirm-revival-attempt',
          }),
        code('ORDER_STATE_CONFLICT'),
      )
    } finally {
      f.repository.close()
    }
  }
})

test('café cancellation enforces fresh verified owner scope, strict reasons and terminal boundaries; buyer cancellation persists its own source', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'scope')
    assert.throws(
      () =>
        f.service.merchantCancelOrder(
          f.foreignCafe,
          order.id,
          cancelInput('foreign'),
        ),
      code('ORDER_NOT_FOUND'),
    )
    assert.throws(
      () =>
        f.service.merchantCancelOrder(
          { ...f.pickup, role: 'cafe' },
          order.id,
          cancelInput('staff'),
        ),
      code('FORBIDDEN'),
    )
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id=?')
      .run(f.cafe.id)
    assert.throws(
      () =>
        f.service.merchantCancelOrder(
          { ...f.cafe, emailVerified: true },
          order.id,
          cancelInput('unverified'),
        ),
      code('EMAIL_NOT_VERIFIED'),
    )
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=? WHERE user_id=?')
      .run(NOW, f.cafe.id)
    for (const input of [
      { reason: 'other', note: 'bad', idempotencyKey: 'invalid-cancel-1' },
      { reason: 'wrong', idempotencyKey: 'invalid-cancel-2' },
      {
        reason: 'closed',
        note: 'x'.repeat(1001),
        idempotencyKey: 'invalid-cancel-3',
      },
      {
        reason: 'closed',
        idempotencyKey: 'invalid-cancel-4',
        buyerId: f.buyer.id,
      },
    ])
      assert.throws(
        () => f.service.merchantCancelOrder(f.cafe, order.id, input),
        code('INVALID_INPUT'),
      )
    const buyerCancelled = f.service.cancel(f.buyer, order.id).order
    assert.deepEqual(buyerCancelled.cancellation, {
      source: 'buyer',
      reason: null,
      note: '',
      at: new Date(NOW).toISOString(),
    })
    assert.throws(
      () =>
        f.service.merchantCancelOrder(f.cafe, order.id, cancelInput('already')),
      code('ORDER_STATE_CONFLICT'),
    )
    const late = confirm(f, 'late-cancel')
    f.setTime(NOW + 60 * MINUTE)
    assert.throws(
      () =>
        f.service.merchantCancelOrder(
          f.cafe,
          late.id,
          cancelInput('past-window'),
        ),
      code('ORDER_STATE_CONFLICT'),
    )
    assert.equal(
      f.service.getOrder(f.buyer, late.id).order.status,
      'not_collected',
    )
  } finally {
    f.repository.close()
  }
})

test('notification failure rolls back café cancellation, offer pause, metadata, audit and idempotency', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'cancel-rollback')
    f.repository.db.exec(
      "CREATE TRIGGER fail_cancel_mail BEFORE INSERT ON email_outbox WHEN NEW.kind='order_cancelled' BEGIN SELECT RAISE(ABORT,'fixture cancel mail failure'); END",
    )
    assert.throws(() =>
      f.service.merchantCancelOrder(f.cafe, order.id, cancelInput('rollback')),
    )
    assert.equal(f.repository.order(order.id)?.status, 'confirmed')
    assert.equal(f.repository.order(order.id)?.cancellation, null)
    assert.equal(f.repository.offer('goa-surprise')?.status, 'published')
    assert.equal(
      f.repository
        .order(order.id)
        ?.events.filter((event) => event.type === 'cancelled').length,
      0,
    )
    assert.equal(
      f.repository.idempotent(f.cafe.id, 'cafe-cancel-rollback'),
      null,
    )
    assert.equal(
      f.repository.db
        .prepare(
          "SELECT COUNT(*) AS count FROM notifications WHERE kind='order_cancelled'",
        )
        .get()?.count,
      0,
    )
    f.repository.db.exec('DROP TRIGGER fail_cancel_mail')
    assert.equal(
      f.service.merchantCancelOrder(f.cafe, order.id, cancelInput('rollback'))
        .order.status,
      'cancelled',
    )
  } finally {
    f.repository.close()
  }
})

test('issue eligibility covers real confirmed and terminal bookings while holds, expired holds and cancelled temporary holds stay excluded', () => {
  const f = fixture()
  try {
    const hold = reserve(f, 'issue-hold')
    assert.throws(
      () => f.service.openOrderIssue(f.buyer, hold.id, issueInput('hold')),
      code('ORDER_STATE_CONFLICT'),
    )
    f.service.cancel(f.buyer, hold.id)
    assert.throws(
      () =>
        f.service.openOrderIssue(
          f.buyer,
          hold.id,
          issueInput('cancelled-hold'),
        ),
      code('ORDER_STATE_CONFLICT'),
    )
    const expired = reserve(f, 'issue-expired')
    f.setTime(NOW + 5 * MINUTE)
    assert.throws(
      () =>
        f.service.openOrderIssue(f.buyer, expired.id, issueInput('expired')),
      code('ORDER_STATE_CONFLICT'),
    )
    const cancelled = confirm(f, 'issue-cancelled')
    f.service.cancel(f.buyer, cancelled.id)
    assert.equal(
      f.service.openOrderIssue(f.buyer, cancelled.id, {
        ...issueInput('cancelled'),
        category: 'cancellation',
      }).issue?.status,
      'open',
    )
    const collected = confirm(f, 'issue-collected'),
      notCollected = confirm(f, 'issue-not-collected')
    f.setTime(NOW + 30 * MINUTE)
    f.service.collect(f.cafe, {
      code: collected.pickupCode,
      idempotencyKey: 'collect-issue-order',
    })
    assert.ok(
      f.service.openOrderIssue(f.buyer, collected.id, {
        ...issueInput('collected'),
        category: 'food_problem',
      }).issue,
    )
    f.setTime(NOW + 60 * MINUTE)
    assert.ok(
      f.service.openOrderIssue(
        f.buyer,
        notCollected.id,
        issueInput('not-collected'),
      ).issue,
    )
    assert.equal(f.repository.order(notCollected.id)?.status, 'not_collected')
  } finally {
    f.repository.close()
  }
})

test('issue messages are scoped, auditable and idempotent; café answers, buyer follow-up reopens and only buyer resolves by revision', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'issue-state')
    assert.equal(f.service.getOrderIssue(f.buyer, order.id).issue, null)
    const opened = f.service.openOrderIssue(
      f.buyer,
      order.id,
      issueInput('state'),
    ).issue!
    assert.equal(opened.revision, 1)
    assert.equal(opened.messages[0].authorRole, 'buyer')
    f.service.openOrderIssue(f.buyer, order.id, issueInput('state'))
    assert.equal(f.repository.orderIssue(order.id)?.messages.length, 1)
    assert.throws(
      () => f.service.openOrderIssue(f.buyer, order.id, issueInput('second')),
      code('ISSUE_ALREADY_EXISTS'),
    )
    assert.throws(
      () =>
        f.service.openOrderIssue(f.buyer, order.id, {
          ...issueInput('state'),
          message: 'A changed initial message.',
        }),
      code('IDEMPOTENCY_CONFLICT'),
    )
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id IN (?,?)')
      .run(f.buyer.id, f.cafe.id)
    const reply = {
      message: 'We can help you at the side entrance.',
      idempotencyKey: 'issue-cafe-reply',
    }
    const answered = f.service.addOrderIssueMessage(
      f.cafe,
      order.id,
      reply,
    ).issue!
    assert.equal(answered.status, 'answered')
    assert.equal(answered.revision, 2)
    assert.equal(answered.messages[1].authorRole, 'cafe')
    assert.equal(answered.messages[1].authorName, f.cafe.name)
    assert.throws(
      () => f.service.resolveOrderIssue(f.cafe, order.id, { revision: 2 }),
      code('FORBIDDEN'),
    )
    assert.throws(
      () => f.service.resolveOrderIssue(f.buyer, order.id, { revision: 1 }),
      code('ISSUE_REVISION_CONFLICT'),
    )
    const closed = f.service.resolveOrderIssue(f.buyer, order.id, {
      revision: 2,
    }).issue!
    assert.equal(closed.status, 'resolved')
    assert.equal(closed.revision, 3)
    // Retry after resolution only reads the current issue; it cannot duplicate or reopen the old café response.
    f.service.addOrderIssueMessage(f.cafe, order.id, reply)
    assert.equal(f.repository.orderIssue(order.id)?.messages.length, 2)
    assert.equal(f.repository.orderIssue(order.id)?.status, 'resolved')
    assert.throws(
      () =>
        f.service.addOrderIssueMessage(f.cafe, order.id, {
          message: 'A new café reply after resolution.',
          idempotencyKey: 'new-closed-reply',
        }),
      code('ISSUE_STATE_CONFLICT'),
    )
    const reopened = f.service.addOrderIssueMessage(f.buyer, order.id, {
      message: 'I still need help with this order.',
      idempotencyKey: 'issue-buyer-followup',
    }).issue!
    assert.equal(reopened.status, 'open')
    assert.equal(reopened.revision, 4)
    for (const user of [f.other, f.foreignCafe])
      assert.throws(
        () => f.service.getOrderIssue(user, order.id),
        code('ORDER_NOT_FOUND'),
      )
    assert.throws(
      () => f.service.getOrderIssue({ ...f.pickup, role: 'cafe' }, order.id),
      code('FORBIDDEN'),
    )
    f.repository.db
      .prepare('INSERT INTO admin_grants VALUES (?,?)')
      .run(f.other.id, new Date(NOW).toISOString())
    assert.throws(
      () => f.service.getOrderIssue(f.other, order.id),
      code('FORBIDDEN'),
    )
    const encoded = JSON.stringify(reopened)
    for (const field of [
      'email',
      'contactPhone',
      'pickupCode',
      'buyerId',
      'author_id',
    ])
      assert.ok(!encoded.includes(field))
    assert.ok(!encoded.includes(order.pickupCode!))
    assert.equal(f.repository.order(order.id)?.status, 'confirmed')
    assert.equal(f.repository.offer(order.offerId)?.available, 7)
    assert.equal(f.repository.order(order.id)?.total, order.total)
  } finally {
    f.repository.close()
  }
})

test('issue validation and message cap bound input; failed message persistence rolls back issue creation and retries safely', () => {
  const f = fixture()
  try {
    const order = confirm(f, 'issue-bounds')
    for (const input of [
      { ...issueInput('invalid'), category: 'unknown' },
      { ...issueInput('invalid'), message: 'four' },
      { ...issueInput('invalid'), message: 'x'.repeat(2001) },
      { ...issueInput('invalid'), authorRole: 'cafe' },
    ])
      assert.throws(
        () => f.service.openOrderIssue(f.buyer, order.id, input),
        code('INVALID_INPUT'),
      )
    f.repository.db.exec(
      "CREATE TRIGGER fail_issue_message BEFORE INSERT ON order_issue_messages BEGIN SELECT RAISE(ABORT,'fixture issue failure'); END",
    )
    assert.throws(() =>
      f.service.openOrderIssue(f.buyer, order.id, issueInput('retry')),
    )
    assert.equal(f.repository.orderIssue(order.id), null)
    assert.equal(f.repository.idempotent(f.buyer.id, 'open-issue-retry'), null)
    f.repository.db.exec('DROP TRIGGER fail_issue_message')
    f.service.openOrderIssue(f.buyer, order.id, issueInput('retry'))
    for (let i = 1; i < 50; i++)
      f.service.addOrderIssueMessage(f.buyer, order.id, {
        message: `Follow-up message number ${i}`,
        idempotencyKey: `issue-bound-message-${i}`,
      })
    const full = f.repository.orderIssue(order.id)!
    assert.equal(full.messages.length, 50)
    assert.throws(
      () =>
        f.service.addOrderIssueMessage(f.buyer, order.id, {
          message: 'The rejected fifty-first message.',
          idempotencyKey: 'issue-bound-overflow',
        }),
      code('ISSUE_MESSAGE_LIMIT'),
    )
    assert.equal(f.repository.orderIssue(order.id)?.messages.length, 50)
    assert.equal(
      f.service.resolveOrderIssue(f.buyer, order.id, {
        revision: full.revision,
      }).issue?.status,
      'resolved',
    )
  } finally {
    f.repository.close()
  }
})

test('merchant issue summaries expose current state for its own café only, never message bodies or issue metadata to pickup staff', () => {
  const f = fixture()
  try {
    const first = confirm(f, 'summary-first')
    f.service.openOrderIssue(f.buyer, first.id, issueInput('summary-first'))
    f.setTime(NOW + MINUTE)
    const second = confirm(f, 'summary-second')
    f.service.openOrderIssue(f.buyer, second.id, issueInput('summary-second'))
    const foreignHold = f.service.reserve(f.buyer, {
      offerId: 'bakery-croissants',
      quantity: 1,
      idempotencyKey: 'reserve-foreign-summary',
    }).order
    const foreignOrder = f.service.confirm(f.buyer, foreignHold.id, {
      idempotencyKey: 'confirm-foreign-summary',
    }).order
    f.service.openOrderIssue(
      f.buyer,
      foreignOrder.id,
      issueInput('summary-foreign'),
    )
    const own = f.service.merchant(f.cafe).orderIssues
    assert.deepEqual(own, [
      {
        orderId: second.id,
        status: 'open',
        updatedAt: new Date(NOW + MINUTE).toISOString(),
      },
      {
        orderId: first.id,
        status: 'open',
        updatedAt: new Date(NOW).toISOString(),
      },
    ])
    assert.deepEqual(
      f.service.merchant(f.foreignCafe).orderIssues.map((item) => item.orderId),
      [foreignOrder.id],
    )
    const pickup = f.service.merchant(f.pickup)
    assert.deepEqual(pickup.orderIssues, [])
    for (const order of pickup.orders) {
      assert.ok(!('issue' in order))
      assert.ok(!('messages' in order))
    }
    f.setTime(NOW + 2 * MINUTE)
    const answered = f.service.addOrderIssueMessage(f.cafe, first.id, {
      message: 'Private conversation body for this buyer.',
      idempotencyKey: 'summary-owner-answer',
    }).issue!
    assert.deepEqual(f.service.merchant(f.cafe).orderIssues[0], {
      orderId: first.id,
      status: 'answered',
      updatedAt: new Date(NOW + 2 * MINUTE).toISOString(),
    })
    f.setTime(NOW + 3 * MINUTE)
    f.service.resolveOrderIssue(f.buyer, first.id, {
      revision: answered.revision,
    })
    assert.deepEqual(f.service.merchant(f.cafe).orderIssues[0], {
      orderId: first.id,
      status: 'resolved',
      updatedAt: new Date(NOW + 3 * MINUTE).toISOString(),
    })
    assert.deepEqual(Object.keys(f.service.merchant(f.cafe).orderIssues[0]), [
      'orderId',
      'status',
      'updatedAt',
    ])
    assert.ok(
      !JSON.stringify(f.service.merchant(f.cafe).orderIssues).includes(
        'Private conversation body',
      ),
    )
  } finally {
    f.repository.close()
  }
})

function legacyChecks(path: string): void {
  const database = new DatabaseSync(path)
  try {
    database.exec(`PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;
      CREATE TABLE old_orders (id TEXT PRIMARY KEY,number TEXT NOT NULL UNIQUE,buyer_id TEXT NOT NULL REFERENCES users(id),offer_id TEXT NOT NULL REFERENCES offers(id),venue_id TEXT NOT NULL REFERENCES venues(id),snapshot TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),total INTEGER NOT NULL CHECK(total>0),status TEXT NOT NULL CHECK(status IN ('reserved','confirmed','collected','cancelled','expired')),created_at TEXT NOT NULL,expires_at TEXT NOT NULL,pickup_code TEXT UNIQUE);
      INSERT INTO old_orders SELECT * FROM orders; DROP TABLE orders; ALTER TABLE old_orders RENAME TO orders;
      CREATE INDEX orders_offer_status ON orders(offer_id,status); CREATE INDEX orders_buyer ON orders(buyer_id); CREATE INDEX orders_venue ON orders(venue_id);
      CREATE TABLE old_notifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),order_id TEXT NOT NULL REFERENCES orders(id),kind TEXT NOT NULL CHECK(kind IN ('order_confirmed','order_cancelled','order_collected','pickup_reminder','booking_confirmed','booking_cancelled','booking_collected')),payload TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT,UNIQUE(user_id,order_id,kind));
      INSERT INTO old_notifications SELECT * FROM notifications; DROP TABLE notifications; ALTER TABLE old_notifications RENAME TO notifications;
      CREATE INDEX notifications_user ON notifications(user_id,created_at DESC,id DESC); CREATE INDEX notifications_unread ON notifications(user_id,read_at);
      COMMIT; PRAGMA foreign_keys=ON;`)
  } finally {
    database.close()
  }
}

test('legacy persisted CHECK migration preserves orders, codes and all children; new status and notification kinds work after restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ostatki-lifecycle-migration-'))
  const path = join(directory, 'legacy.sqlite')
  let repository: Repository | undefined
  try {
    const f = fixture(path)
    repository = f.repository
    const order = confirm(f, 'migration'),
      buyer = f.buyer,
      cafe = f.cafe
    const issue = f.service.openOrderIssue(
      buyer,
      order.id,
      issueInput('migration'),
    ).issue!
    const token = randomBytes(32).toString('base64url')
    f.repository.db
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(
        createHash('sha256').update(token).digest('hex'),
        buyer.id,
        NOW + 24 * 60 * MINUTE,
      )
    const before = {
      order: f.repository.order(order.id),
      events: f.repository.db
        .prepare('SELECT * FROM order_events ORDER BY rowid')
        .all(),
      notifications: f.repository.db
        .prepare('SELECT * FROM notifications ORDER BY rowid')
        .all(),
      jobs: f.repository.db
        .prepare('SELECT * FROM email_outbox ORDER BY rowid')
        .all(),
      keys: f.repository.db
        .prepare('SELECT * FROM idempotency ORDER BY rowid')
        .all(),
      reminders: f.repository.db
        .prepare('SELECT * FROM pickup_reminders ORDER BY rowid')
        .all(),
    }
    repository.close()
    repository = undefined
    legacyChecks(path)
    repository = new Repository(path, NOW, { seedFixtures: true })
    assert.deepEqual(repository.order(order.id), before.order)
    for (const [table, rows] of [
      ['order_events', before.events],
      ['notifications', before.notifications],
      ['email_outbox', before.jobs],
      ['idempotency', before.keys],
      ['pickup_reminders', before.reminders],
    ] as const)
      assert.deepEqual(
        repository.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
        rows,
      )
    assert.equal(
      repository.db.prepare('PRAGMA foreign_keys').get()?.foreign_keys,
      1,
    )
    assert.deepEqual(
      repository.db.prepare('PRAGMA foreign_key_check').all(),
      [],
    )
    assert.equal(repository.orderIssue(order.id)?.id, issue.id)
    const service = new MarketplaceService(repository, () => NOW)
    assert.equal(service.session(token)?.id, buyer.id)
    assert.equal(
      service.confirm(buyer, order.id, { idempotencyKey: 'confirm-migration' })
        .order.pickupCode,
      order.pickupCode,
    )
    const answer = service.addOrderIssueMessage(cafe, order.id, {
      message: 'The conversation survived the upgrade.',
      idempotencyKey: 'migration-answer',
    }).issue!
    assert.equal(answer.revision, 2)
    assert.throws(
      () => service.resolveOrderIssue(buyer, order.id, { revision: 1 }),
      code('ISSUE_REVISION_CONFLICT'),
    )
    assert.equal(finalizeUncollectedOrders(repository, NOW + 60 * MINUTE), 1)
    assert.equal(repository.order(order.id)?.status, 'not_collected')
    assert.equal(
      repository.db
        .prepare(
          "SELECT COUNT(*) AS count FROM notifications WHERE kind='order_not_collected'",
        )
        .get()?.count,
      1,
    )
    repository.close()
    repository = new Repository(path, NOW, { seedFixtures: true })
    assert.equal(finalizeUncollectedOrders(repository, NOW + 70 * MINUTE), 0)
    assert.equal(repository.orderIssue(order.id)?.messages.length, 2)
    assert.equal(repository.offer(order.offerId)?.available, 7)
  } finally {
    repository?.close()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an invalid legacy child FK rolls migration back without discarding original rows or CHECK constraints', () => {
  const directory = mkdtempSync(
    join(tmpdir(), 'ostatki-lifecycle-migration-fail-'),
  )
  const path = join(directory, 'legacy.sqlite')
  let raw: DatabaseSync | undefined
  try {
    const f = fixture(path)
    confirm(f, 'migration-failure')
    f.repository.close()
    legacyChecks(path)
    raw = new DatabaseSync(path)
    raw.exec('PRAGMA foreign_keys=OFF')
    raw.prepare("UPDATE email_outbox SET user_id='missing-fixture-user'").run()
    const oldSchema = raw
      .prepare(
        "SELECT sql FROM sqlite_master WHERE name IN ('orders','notifications') ORDER BY name",
      )
      .all()
    const orders = raw.prepare('SELECT * FROM orders').all()
    raw.close()
    raw = undefined
    assert.throws(
      () => new Repository(path, NOW, { seedFixtures: true }),
      /foreign-key check/,
    )
    raw = new DatabaseSync(path)
    assert.deepEqual(
      raw
        .prepare(
          "SELECT sql FROM sqlite_master WHERE name IN ('orders','notifications') ORDER BY name",
        )
        .all(),
      oldSchema,
    )
    assert.deepEqual(raw.prepare('SELECT * FROM orders').all(), orders)
    assert.equal(
      raw
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE name IN ('orders_lifecycle','notifications_lifecycle')",
        )
        .get()?.count,
      0,
    )
  } finally {
    raw?.close()
    rmSync(directory, { recursive: true, force: true })
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

test('actual cancellation/issue routes protect Origin, ownership and sessions revoked during slow body upload', async () => {
  const f = fixture()
  const runtime = globalThis as typeof globalThis & {
    ostatkiService?: MarketplaceService
  }
  const previous = runtime.ostatkiService
  runtime.ostatkiService = f.service
  try {
    const order = confirm(f, 'route'),
      context = { params: Promise.resolve({ id: order.id }) }
    assert.equal(
      (
        await issueGet(
          new Request('https://food.example/api/orders/id/issue'),
          context,
        )
      ).status,
      401,
    )
    const otherToken = session(f, f.other),
      buyerToken = session(f, f.buyer)
    assert.equal(
      (
        await issueGet(
          new Request('https://food.example/api/orders/id/issue', {
            headers: { cookie: `ostatki_session=${otherToken}` },
          }),
          context,
        )
      ).status,
      404,
    )
    const response = await issueGet(
      new Request('https://food.example/api/orders/id/issue', {
        headers: { cookie: `ostatki_session=${buyerToken}` },
      }),
      context,
    )
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(
      (
        await issuePost(
          new Request('https://food.example/api/orders/id/issue', {
            method: 'POST',
            headers: {
              origin: 'https://evil.example',
              'content-type': 'application/json',
              cookie: `ostatki_session=${buyerToken}`,
            },
            body: JSON.stringify(issueInput('foreign-origin')),
          }),
          context,
        )
      ).status,
      403,
    )
    for (const item of [
      {
        handler: cancelRoute,
        path: '/api/merchant/orders/id/cancel',
        actor: f.cafe,
        input: cancelInput('slow-body'),
      },
      {
        handler: issuePost,
        path: '/api/orders/id/issue',
        actor: f.buyer,
        input: issueInput('slow-body'),
      },
      {
        handler: messagePost,
        path: '/api/orders/id/issue/messages',
        actor: f.cafe,
        input: {
          message: 'A slow request body reply.',
          idempotencyKey: 'slow-issue-reply',
        },
      },
      {
        handler: resolvePost,
        path: '/api/orders/id/issue/resolve',
        actor: f.buyer,
        input: { revision: 1 },
      },
    ]) {
      const token = session(f, item.actor)
      let release!: () => void, reading!: () => void
      const waiting = new Promise<void>((resolve) => {
          release = resolve
        }),
        started = new Promise<void>((resolve) => {
          reading = resolve
        })
      const body = new ReadableStream<Uint8Array>(
        {
          async pull(controller) {
            reading()
            await waiting
            controller.enqueue(
              new TextEncoder().encode(JSON.stringify(item.input)),
            )
            controller.close()
          },
        },
        { highWaterMark: 0 },
      )
      const request = new Request(`https://food.example${item.path}`, {
        method: 'POST',
        headers: {
          origin: 'https://food.example',
          'content-type': 'application/json',
          cookie: `ostatki_session=${token}`,
        },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' })
      const pending = item.handler(request, context)
      await started
      f.service.deleteSession(token)
      const before = f.repository.db
        .prepare('SELECT total_changes() AS count')
        .get()?.count
      release()
      const rejected = await pending
      assert.equal(rejected.status, 401, item.path)
      assert.equal((await rejected.json()).error.code, 'AUTH_REQUIRED')
      assert.equal(
        f.repository.db.prepare('SELECT total_changes() AS count').get()?.count,
        before,
      )
    }
    assert.equal(f.repository.order(order.id)?.status, 'confirmed')
    assert.equal(f.repository.orderIssue(order.id), null)
  } finally {
    if (previous === undefined) delete runtime.ostatkiService
    else runtime.ostatkiService = previous
    f.repository.close()
  }
})
