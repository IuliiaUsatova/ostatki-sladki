import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { DomainError } from '../src/domain/errors.ts'
import { Repository } from '../src/server/repository.ts'
import {
  MarketplaceService,
  RESERVATION_TTL_MS,
  SESSION_TTL_MS,
} from '../src/server/service.ts'
import { SEED_USERS } from '../src/server/seed.ts'
import {
  assertSameOrigin,
  endpoint,
  readJson,
  sessionCookie,
  sessionToken,
} from '../src/server/http.ts'

const INITIAL_TIME = Date.parse('2026-10-11T12:00:00.000Z')
function fixture() {
  let time = INITIAL_TIME
  const repository = new Repository(':memory:', time, { seedFixtures: true })
  const service = new MarketplaceService(repository, () => time, {
    allowPersonaSessions: true,
  })
  return {
    repository,
    service,
    advance: (milliseconds: number) => {
      time += milliseconds
    },
  }
}

function expectCode(action: () => unknown, code: string) {
  assert.throws(
    action,
    (error: unknown) => error instanceof DomainError && error.code === code,
  )
}

const reserve = (
  service: MarketplaceService,
  offerId = 'goa-surprise',
  quantity = 1,
  key = 'reservation-0001',
) =>
  service.reserve(SEED_USERS.buyer, { offerId, quantity, idempotencyKey: key })
    .order
const confirm = (
  service: MarketplaceService,
  id: string,
  key = 'confirmation-0001',
) => service.confirm(SEED_USERS.buyer, id, { idempotencyKey: key }).order

test('atomic reservation refuses overselling and does not leave a partial order', () => {
  const { repository, service } = fixture()
  try {
    reserve(service, 'goa-surprise', 8)
    expectCode(
      () => reserve(service, 'goa-surprise', 1, 'reservation-0002'),
      'INSUFFICIENT_STOCK',
    )
    assert.equal(service.listOrders(SEED_USERS.buyer).orders.length, 1)
    assert.equal(service.getOffer('goa-surprise').offer.available, 0)
  } finally {
    repository.close()
  }
})

test('parallel SQLite connections can sell the final portion only once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-concurrency-'))
  const path = join(dir, 'demo.sqlite')
  const repository = new Repository(path, INITIAL_TIME, { seedFixtures: true })
  new MarketplaceService(repository, () => INITIAL_TIME, {
    allowPersonaSessions: true,
  }).patchOffer(SEED_USERS.cafe, 'goa-surprise', { totalQuantity: 1 })
  repository.close()
  try {
    const results = await Promise.all(
      [1, 2].map(
        (index) =>
          new Promise<{ status: string }>((resolve, reject) => {
            const worker = new Worker(
              new URL('./reservation-worker.ts', import.meta.url),
              {
                workerData: {
                  path,
                  now: INITIAL_TIME,
                  key: `worker-reservation-${index}`,
                },
              },
            )
            worker.once('message', resolve)
            worker.once('error', reject)
            worker.once('exit', (code) => {
              if (code !== 0) reject(new Error(`Worker exited: ${code}`))
            })
          }),
      ),
    )
    assert.deepEqual(results.map((result) => result.status).sort(), [
      'INSUFFICIENT_STOCK',
      'reserved',
    ])
    const check = new Repository(path, INITIAL_TIME, { seedFixtures: true })
    assert.equal(check.offer('goa-surprise')?.available, 0)
    assert.equal(check.orders({ buyerId: 'alina' }).length, 1)
    check.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('expired reservations release stock exactly once and cannot be confirmed', () => {
  const { repository, service, advance } = fixture()
  try {
    const order = reserve(service, 'goa-surprise', 2)
    assert.equal(service.getOffer('goa-surprise').offer.available, 6)
    advance(RESERVATION_TTL_MS)
    assert.equal(service.getOffer('goa-surprise').offer.available, 8)
    assert.equal(
      service.getOrder(SEED_USERS.buyer, order.id).order.status,
      'expired',
    )
    expectCode(() => confirm(service, order.id), 'RESERVATION_EXPIRED')
    service.listOffers()
    assert.equal(
      repository
        .order(order.id)
        ?.events.filter((event) => event.type === 'expired').length,
      1,
    )
    assert.equal(
      reserve(service, 'goa-surprise', 2, 'reservation-0001').status,
      'expired',
    )
    assert.equal(service.listOrders(SEED_USERS.buyer).orders.length, 1)
  } finally {
    repository.close()
  }
})

test('reservation and confirmation retries are idempotent and bound to the original payload', () => {
  const { repository, service } = fixture()
  try {
    const first = reserve(service)
    assert.equal(reserve(service).id, first.id)
    expectCode(
      () => reserve(service, 'goa-surprise', 2),
      'IDEMPOTENCY_CONFLICT',
    )
    expectCode(() => reserve(service, 'goa-chicken'), 'IDEMPOTENCY_CONFLICT')
    const done = confirm(service, first.id)
    assert.equal(confirm(service, first.id).pickupCode, done.pickupCode)
    assert.equal(service.getOffer('goa-surprise').offer.available, 7)
    assert.equal(
      done.events.filter((event) => event.type === 'confirmed').length,
      1,
    )
    expectCode(
      () =>
        service.confirm(SEED_USERS.buyer, first.id, {
          idempotencyKey: 'reservation-0001',
        }),
      'IDEMPOTENCY_CONFLICT',
    )
  } finally {
    repository.close()
  }
})

test('an order retains its price, pickup terms, allergens and all translations after offer edits', () => {
  const { repository, service } = fixture()
  try {
    const original = reserve(service, 'goa-chicken')
    service.patchOffer(SEED_USERS.cafe, 'goa-chicken', {
      price: 2200,
      pickupStart: new Date(INITIAL_TIME + 60 * 60_000).toISOString(),
      totalQuantity: 5,
    })
    const current = service.getOrder(SEED_USERS.buyer, original.id).order
    assert.deepEqual(current.snapshot, original.snapshot)
    assert.equal(current.total, 1800)
    assert.equal(service.getOffer('goa-chicken').offer.price, 2200)
    assert.equal(current.snapshot.translations.en.title, 'Chicken with rice')
  } finally {
    repository.close()
  }
})

test('buyer scope hides other people’s orders and mutations', () => {
  const { repository, service } = fixture()
  try {
    const order = reserve(service)
    assert.deepEqual(service.listOrders(SEED_USERS['buyer-other']).orders, [])
    expectCode(
      () => service.getOrder(SEED_USERS['buyer-other'], order.id),
      'ORDER_NOT_FOUND',
    )
    expectCode(
      () =>
        service.confirm(SEED_USERS['buyer-other'], order.id, {
          idempotencyKey: 'foreign-confirmation',
        }),
      'ORDER_NOT_FOUND',
    )
    expectCode(
      () => service.cancel(SEED_USERS['buyer-other'], order.id),
      'ORDER_NOT_FOUND',
    )
    expectCode(
      () =>
        service.reserve(SEED_USERS.cafe, {
          offerId: 'goa-surprise',
          quantity: 1,
          idempotencyKey: 'role-reserve',
        }),
      'FORBIDDEN',
    )
    expectCode(() => service.listOrders(null), 'AUTH_REQUIRED')
  } finally {
    repository.close()
  }
})

test('merchant stock and orders are venue-scoped; staff cannot publish; unapproved venues cannot publish', () => {
  const { repository, service } = fixture()
  try {
    reserve(service)
    const other = service.merchant(SEED_USERS['cafe-other'])
    assert.equal(other.orders.length, 0)
    assert.ok(other.offers.every((offer) => offer.venueId === 'bread-house'))
    expectCode(
      () =>
        service.patchOffer(SEED_USERS['cafe-other'], 'goa-surprise', {
          price: 2600,
        }),
      'OFFER_NOT_FOUND',
    )
    expectCode(
      () =>
        service.patchOffer(SEED_USERS.pickup, 'goa-surprise', { price: 2600 }),
      'FORBIDDEN',
    )
    expectCode(
      () =>
        service.patchOffer(SEED_USERS['cafe-pending'], 'goa-surprise', {
          status: 'published',
        }),
      'VENUE_PENDING',
    )
    assert.equal(
      service.merchant(SEED_USERS['cafe-pending']).venue.status,
      'pending',
    )
  } finally {
    repository.close()
  }
})

test('reducing capacity below committed stock is rejected; pausing keeps confirmed orders intact', () => {
  const { repository, service } = fixture()
  try {
    const order = confirm(service, reserve(service, 'goa-surprise', 2).id)
    expectCode(
      () =>
        service.patchOffer(SEED_USERS.cafe, 'goa-surprise', {
          totalQuantity: 1,
        }),
      'CAPACITY_BELOW_COMMITTED',
    )
    service.patchOffer(SEED_USERS.cafe, 'goa-surprise', {
      status: 'paused',
      totalQuantity: 2,
    })
    expectCode(
      () => reserve(service, 'goa-surprise', 1, 'new-reservation'),
      'OFFER_UNAVAILABLE',
    )
    assert.equal(
      service.getOrder(SEED_USERS.buyer, order.id).order.status,
      'confirmed',
    )
    assert.equal(
      service
        .merchant(SEED_USERS.cafe)
        .offers.find((offer) => offer.id === 'goa-surprise')?.available,
      0,
    )
  } finally {
    repository.close()
  }
})

test('pickup uses a one-time code, immutable window, venue and active staff shift', () => {
  const { repository, service, advance } = fixture()
  try {
    const order = confirm(service, reserve(service).id)
    const code = order.pickupCode!
    expectCode(
      () => service.lookupPickup(SEED_USERS['cafe-other'], code),
      'PICKUP_NOT_FOUND',
    )
    assert.equal(
      service.lookupPickup(SEED_USERS.pickup, code).order.id,
      order.id,
    )
    const collected = service.collect(SEED_USERS.pickup, {
      code,
      idempotencyKey: 'pickup-idempotency-1',
    }).order
    assert.equal(collected.status, 'collected')
    assert.equal(
      service.collect(SEED_USERS.pickup, {
        code,
        idempotencyKey: 'pickup-idempotency-1',
      }).order.id,
      order.id,
    )
    expectCode(
      () =>
        service.collect(SEED_USERS.cafe, {
          code,
          idempotencyKey: 'new-pickup-try',
        }),
      'ALREADY_COLLECTED',
    )
    assert.equal(
      repository
        .order(order.id)
        ?.events.filter((event) => event.type === 'collected').length,
      1,
    )
    assert.equal(service.getOffer('goa-surprise').offer.available, 7)
    advance(8 * 60 * 60_000)
    expectCode(
      () => service.lookupPickup(SEED_USERS.pickup, code),
      'SHIFT_CLOSED',
    )
    expectCode(() => service.merchant(SEED_USERS.pickup), 'SHIFT_CLOSED')
  } finally {
    repository.close()
  }
})

test('pickup is rejected before and after the order window even when offer times change', () => {
  const { repository, service, advance } = fixture()
  try {
    const order = confirm(service, reserve(service, 'goa-chicken').id)
    const input = {
      code: order.pickupCode,
      idempotencyKey: 'pickup-window-test',
    }
    expectCode(
      () => service.collect(SEED_USERS.cafe, input),
      'OUTSIDE_PICKUP_WINDOW',
    )
    service.patchOffer(SEED_USERS.cafe, 'goa-chicken', {
      pickupStart: new Date(INITIAL_TIME - 60_000).toISOString(),
    })
    expectCode(
      () => service.collect(SEED_USERS.cafe, input),
      'OUTSIDE_PICKUP_WINDOW',
    )
    advance(150 * 60_000)
    assert.equal(service.now(), order.snapshot.pickupEnd)
    expectCode(
      () => service.collect(SEED_USERS.cafe, input),
      'OUTSIDE_PICKUP_WINDOW',
    )
    advance(60_000)
    expectCode(
      () => service.collect(SEED_USERS.cafe, input),
      'OUTSIDE_PICKUP_WINDOW',
    )
  } finally {
    repository.close()
  }
})

test('buyer cancellation restores stock before pickup and closes exactly at pickup start', () => {
  const { repository, service, advance } = fixture()
  try {
    const first = confirm(service, reserve(service, 'goa-chicken').id)
    assert.equal(
      service.cancel(SEED_USERS.buyer, first.id).order.status,
      'cancelled',
    )
    assert.equal(
      service.cancel(SEED_USERS.buyer, first.id).order.status,
      'cancelled',
    )
    assert.equal(service.getOffer('goa-chicken').offer.available, 3)
    const second = confirm(
      service,
      reserve(service, 'goa-chicken', 1, 'second-reservation').id,
      'second-confirmation',
    )
    advance(30 * 60_000)
    expectCode(
      () => service.cancel(SEED_USERS.buyer, second.id),
      'CANCELLATION_CLOSED',
    )
    assert.equal(
      service.getOrder(SEED_USERS.buyer, second.id).order.status,
      'confirmed',
    )
  } finally {
    repository.close()
  }
})

test('an unpaid hold can be released during pickup while confirmed cancellation remains closed', () => {
  const { repository, service } = fixture()
  try {
    const hold = reserve(service)
    assert.equal(hold.pickupCode, null)
    assert.ok(Date.parse(hold.snapshot.pickupStart) < INITIAL_TIME)
    const released = service.cancel(SEED_USERS.buyer, hold.id).order
    assert.equal(released.status, 'cancelled')
    assert.equal(released.pickupCode, null)
    assert.equal(service.getOffer('goa-surprise').offer.available, 8)
    assert.match(released.events.at(-1)!.message, /Неоплаченная бронь снята/)
    assert.equal(
      released.events.some((event) => event.type === 'confirmed'),
      false,
    )
    const paidDemo = confirm(
      service,
      reserve(service, 'goa-surprise', 1, 'active-window-second-hold').id,
    )
    expectCode(
      () => service.cancel(SEED_USERS.buyer, paidDemo.id),
      'CANCELLATION_CLOSED',
    )
  } finally {
    repository.close()
  }
})

test('runtime validation rejects client totals, ownership, fractional quantities and malformed keys', () => {
  const { repository, service } = fixture()
  try {
    const base = {
      offerId: 'goa-surprise',
      quantity: 1,
      idempotencyKey: 'valid-key-0001',
    }
    for (const input of [
      { ...base, total: 1 },
      { ...base, buyerId: 'timur' },
      { ...base, quantity: 1.5 },
      { ...base, quantity: -1 },
      { ...base, quantity: NaN },
      { ...base, idempotencyKey: '../token' },
    ]) {
      expectCode(
        () => service.reserve(SEED_USERS.buyer, input),
        'INVALID_INPUT',
      )
    }
    expectCode(
      () => service.createSession({ persona: 'buyer', role: 'cafe' }),
      'INVALID_INPUT',
    )
    assert.equal(service.listOrders(SEED_USERS.buyer).orders.length, 0)
  } finally {
    repository.close()
  }
})

test('offer creation validates windows/assets, binds optional idempotency and preserves typed translations', () => {
  const { repository, service } = fixture()
  try {
    const source = service.getOffer('goa-chicken').offer
    const input = {
      title: 'Новый обед',
      kind: source.kind,
      description: source.description,
      guarantee: source.guarantee,
      allergens: source.allergens,
      price: 1200,
      originalPrice: 2400,
      totalQuantity: 5,
      image: source.image,
      pickupStart: source.pickupStart,
      pickupEnd: source.pickupEnd,
      translations: source.translations,
      idempotencyKey: 'create-offer-0001',
    }
    const first = service.createOffer(SEED_USERS.cafe, input).offer
    assert.equal(first.title, 'Новый обед')
    assert.equal(service.createOffer(SEED_USERS.cafe, input).offer.id, first.id)
    expectCode(
      () => service.createOffer(SEED_USERS.cafe, { ...input, price: 1300 }),
      'IDEMPOTENCY_CONFLICT',
    )
    expectCode(
      () =>
        service.createOffer(SEED_USERS.cafe, {
          ...input,
          image: 'https://untrusted.example/image.png',
        }),
      'INVALID_INPUT',
    )
    expectCode(
      () =>
        service.createOffer(SEED_USERS.cafe, {
          ...input,
          idempotencyKey: 'create-offer-0002',
          pickupEnd: input.pickupStart,
        }),
      'INVALID_WINDOW',
    )
    expectCode(
      () => service.createOffer(SEED_USERS['cafe-pending'], input),
      'VENUE_PENDING',
    )
    const { translations: suppliedTranslations, ...missingTranslations } = input
    expectCode(
      () => service.createOffer(SEED_USERS.cafe, missingTranslations),
      'INVALID_INPUT',
    )
    expectCode(
      () =>
        service.createOffer(SEED_USERS.cafe, {
          ...input,
          translations: {
            ru: suppliedTranslations.ru,
            en: suppliedTranslations.en,
          },
        }),
      'INVALID_INPUT',
    )
    expectCode(
      () =>
        service.createOffer(SEED_USERS.cafe, {
          ...input,
          translations: {
            ...suppliedTranslations,
            en: { ...suppliedTranslations.en, description: '' },
          },
        }),
      'INVALID_INPUT',
    )
  } finally {
    repository.close()
  }
})

test('sessions are opaque, server-scoped, revocable and expire after 24 hours', () => {
  const { repository, service, advance } = fixture()
  try {
    const first = service.createSession({ persona: 'buyer' })
    assert.equal(first.token.length, 43)
    assert.equal(service.session(first.token)?.id, 'alina')
    assert.equal(
      repository.db.prepare('SELECT token_hash FROM sessions').get()
        ?.token_hash === first.token,
      false,
    )
    assert.equal(service.session('alina'), null)
    service.deleteSession(first.token)
    assert.equal(service.session(first.token), null)
    const next = service.createSession({ persona: 'pickup' })
    advance(SESSION_TTL_MS)
    assert.equal(service.session(next.token), null)
  } finally {
    repository.close()
  }
})

test('Origin guard and cookie flags block cross-site state changes and session ambiguity', async () => {
  const url = 'https://ostatki.example/api/session'
  const good = new Request(url, {
    method: 'POST',
    headers: { origin: 'https://ostatki.example' },
  })
  assert.doesNotThrow(() => assertSameOrigin(good))
  const rejectedOrigins: Record<string, string>[] = [
    {},
    { origin: 'https://attacker.example' },
    { origin: 'null' },
    { origin: 'https://ostatki.example', 'sec-fetch-site': 'cross-site' },
  ]
  for (const headers of rejectedOrigins) {
    expectCode(
      () => assertSameOrigin(new Request(url, { method: 'POST', headers })),
      'ORIGIN_REJECTED',
    )
  }
  const token = 'a'.repeat(43)
  assert.match(
    sessionCookie(good, token),
    /HttpOnly; SameSite=Lax; Max-Age=86400; Secure$/,
  )
  assert.match(sessionCookie(good, null), /Max-Age=0/)
  assert.equal(
    sessionToken(
      new Request(url, {
        headers: { cookie: `ostatki_session=${token}; role=cafe` },
      }),
    ),
    token,
  )
  assert.equal(
    sessionToken(
      new Request(url, {
        headers: {
          cookie: `ostatki_session=${token}; ostatki_session=${token}`,
        },
      }),
    ),
    null,
  )
  const { repository, service } = fixture()
  try {
    const response = await endpoint(
      new Request(url, { method: 'POST' }),
      true,
      () => ({ changed: true }),
      service,
    )
    assert.equal(response.status, 403)
    assert.equal((await response.json()).error.code, 'ORIGIN_REJECTED')
  } finally {
    repository.close()
  }
})

test('HTTP body validation bounds data size and returns structured failures', async () => {
  const url = 'http://localhost:3104/api/reservations'
  await assert.rejects(
    readJson(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    ),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'INVALID_INPUT',
  )
  await assert.rejects(
    readJson(
      new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'a'.repeat(20_000) }),
      }),
    ),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'BODY_TOO_LARGE',
  )
  const { repository, service } = fixture()
  try {
    const response = await endpoint(
      new Request(url),
      false,
      ({ service: current, user }) => current.listOrders(user),
      service,
    )
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal((await response.json()).error.code, 'AUTH_REQUIRED')
  } finally {
    repository.close()
  }
})

test('data and fixed pickup windows survive reopening the persistent database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-persistence-'))
  const path = join(dir, 'demo.sqlite')
  try {
    const first = new Repository(path, INITIAL_TIME, { seedFixtures: true })
    const service = new MarketplaceService(first, () => INITIAL_TIME, {
      allowPersonaSessions: true,
    })
    const order = confirm(service, reserve(service).id)
    const originalStart = service.getOffer('goa-surprise').offer.pickupStart
    first.close()
    const reopened = new Repository(path, INITIAL_TIME + 24 * 60 * 60_000, {
      seedFixtures: true,
    })
    assert.equal(reopened.order(order.id)?.status, 'confirmed')
    assert.equal(reopened.offer('goa-surprise')?.pickupStart, originalStart)
    reopened.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
