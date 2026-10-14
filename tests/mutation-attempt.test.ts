import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/shared/api/index.transport.ts'
import {
  createMutationAttempt,
  isDefinitiveMutationFailure,
} from '../src/shared/lib/frozen-attempt/mutation-attempt.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { SEED_USERS } from '../src/server/seed.ts'
import type { CreateOfferInput } from '../src/domain/types.ts'
import {
  isOfferAttempt,
  offerAttemptStorage,
} from '../src/features/edit-offer/model/offer-attempt.ts'

function memoryStorage() {
  const records = new Map<string, string>()
  return {
    records,
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
    removeItem: (key: string) => {
      records.delete(key)
    },
  }
}

type Payload = {
  idempotencyKey: string
  quantity: number
  nested: { name: string }
}
const valid = (value: unknown): value is Payload => {
  const input = value as Partial<Payload> | null
  return (
    !!input &&
    typeof input === 'object' &&
    typeof input.idempotencyKey === 'string' &&
    typeof input.quantity === 'number' &&
    Number.isSafeInteger(input.quantity) &&
    input.quantity > 0 &&
    typeof input.nested?.name === 'string'
  )
}
const storageFailure = (error: unknown) =>
  error instanceof ApiError &&
  error.code === 'STORAGE_UNAVAILABLE' &&
  error.status === 400

test('existing nested-payload attempts preserve their original key and exact data across retries', () => {
  type Nested = { action: string; payload: Payload }
  const validate = (value: unknown): value is Nested => {
    const envelope = value as Partial<Nested> | null
    return (
      !!envelope &&
      typeof envelope.action === 'string' &&
      valid(envelope.payload)
    )
  }
  const storage = memoryStorage()
  const attempt = createMutationAttempt({
    scope: 'issue:order-1',
    storage,
    validate,
    makeKey: () => 'issue-request-key',
  })
  const original = attempt.freeze((idempotencyKey) => ({
    action: 'reply',
    payload: { idempotencyKey, quantity: 2, nested: { name: 'Original' } },
  }))
  const reload = createMutationAttempt({
    scope: 'issue:order-1',
    storage,
    validate,
  })
  assert.deepEqual(reload.restore(), original)
  assert.deepEqual(
    reload.freeze(() =>
      assert.fail('Nested retry must retain its original payload'),
    ),
    original,
  )
  const corrupt = { ...original, idempotencyKey: '' }
  storage.setItem('ostatki:payload:issue:order-1', JSON.stringify(corrupt))
  assert.throws(reload.restore, storageFailure)
})

test('legacy offer payload migration retains its original key, fails closed on corruption and excludes a key from PATCH bodies', () => {
  const key = '71a171a4-b9e1-4274-9f52-053bf65e5fef'
  const scope = 'merchant-offer:actor:new'
  const storage = memoryStorage()
  const translation = {
    title: 'Evening meal',
    description: 'Fresh meal.',
    guarantee: 'One complete meal.',
    allergens: [],
  }
  const original: CreateOfferInput = {
    ...translation,
    idempotencyKey: key,
    kind: 'specific_item',
    price: 1000,
    originalPrice: 2000,
    totalQuantity: 2,
    image: '/images/goa-food.png',
    pickupStart: '2026-10-14T16:00:00Z',
    pickupEnd: '2026-10-14T17:00:00Z',
    translations: { ru: translation, kk: translation, en: translation },
  }
  storage.setItem(`ostatki:pending:${scope}`, JSON.stringify(original))
  const adapter = offerAttemptStorage(scope, false, storage, () =>
    assert.fail('Legacy create must retain its existing key'),
  )
  const attempt = createMutationAttempt({
    scope,
    storage: adapter,
    validate: isOfferAttempt,
    makeKey: () =>
      assert.fail('Legacy create cannot generate a replacement key'),
  })
  const restored = attempt.restore()!
  assert.equal(restored.idempotencyKey, key)
  assert.deepEqual(restored.payload, original)
  assert.deepEqual(
    attempt.freeze(() => assert.fail('Legacy retry cannot rebuild')),
    restored,
  )
  for (const corrupt of [
    '{',
    '{}',
    JSON.stringify({ ...original, idempotencyKey: '' }),
  ]) {
    const broken = memoryStorage()
    broken.setItem(`ostatki:pending:${scope}`, corrupt)
    const retry = createMutationAttempt({
      scope,
      storage: offerAttemptStorage(scope, false, broken, () =>
        assert.fail('Corrupt create cannot generate a key'),
      ),
      validate: isOfferAttempt,
      makeKey: () => assert.fail('Corrupt create cannot generate a key'),
    })
    assert.throws(retry.restore, storageFailure)
    assert.equal(broken.getItem(`ostatki:payload:${scope}`), null)
  }
  const editScope = 'merchant-offer:actor:offer-1',
    editing = memoryStorage()
  const patch = {
    price: 1100,
    totalQuantity: 2,
    status: 'published',
    pickupStart: original.pickupStart,
    pickupEnd: original.pickupEnd,
  }
  editing.setItem(`ostatki:pending:${editScope}`, JSON.stringify(patch))
  const edit = createMutationAttempt({
    scope: editScope,
    storage: offerAttemptStorage(editScope, true, editing, () => key),
    validate: isOfferAttempt,
  })
  const editAttempt = edit.restore()!
  assert.equal(editAttempt.idempotencyKey, key)
  assert.deepEqual(editAttempt.payload, patch)
  assert.equal('idempotencyKey' in editAttempt.payload, false)
})

test('a complete detached JSON payload is persisted before dispatch and restored exactly across reload and draft changes', () => {
  const storage = memoryStorage()
  let generated = 0
  const options = {
    scope: 'buyer-1:reserve',
    storage,
    validate: valid,
    makeKey: () => `attempt-${++generated}`,
  }
  const attempt = createMutationAttempt(options)
  const draft = { quantity: 2, nested: { name: 'Original' } }
  const first = attempt.freeze((idempotencyKey) => ({
    idempotencyKey,
    ...draft,
  }))
  assert.deepEqual(
    JSON.parse(storage.getItem('ostatki:payload:buyer-1:reserve')!),
    first,
  )
  draft.quantity = 7
  draft.nested.name = 'Changed'
  assert.equal(first.nested.name, 'Original')
  const reloaded = createMutationAttempt(options)
  assert.deepEqual(reloaded.restore(), first)
  assert.deepEqual(
    reloaded.freeze(() =>
      assert.fail('Retry must not rebuild the original payload'),
    ),
    first,
  )
  assert.equal(generated, 1)
  assert.equal(
    createMutationAttempt({ ...options, scope: 'buyer-2:reserve' }).restore(),
    null,
  )
})

test('corrupt, structurally invalid and unreadable storage fails closed without generating a replacement attempt', () => {
  for (const serialized of [
    '{',
    'null',
    '{}',
    '{"idempotencyKey":"","quantity":2,"nested":{"name":"X"}}',
    '{"idempotencyKey":"saved-key","quantity":0,"nested":{"name":"X"}}',
  ]) {
    const storage = memoryStorage()
    storage.setItem('ostatki:payload:buyer:reserve', serialized)
    const attempt = createMutationAttempt({
      scope: 'buyer:reserve',
      storage,
      validate: valid,
      makeKey: () => assert.fail('Corruption cannot create a new key'),
    })
    assert.throws(attempt.restore, storageFailure)
    assert.throws(
      () =>
        attempt.freeze(() =>
          assert.fail('Corruption cannot dispatch a new payload'),
        ),
      storageFailure,
    )
    assert.equal(storage.getItem('ostatki:payload:buyer:reserve'), serialized)
  }
  const storage = memoryStorage()
  const attempt = createMutationAttempt({
    scope: 'buyer:reserve',
    validate: valid,
    storage: {
      ...storage,
      getItem: () => {
        throw Error('Unavailable')
      },
    },
  })
  assert.throws(attempt.restore, storageFailure)
  assert.throws(
    () =>
      attempt.freeze(() => assert.fail('Unreadable original cannot dispatch')),
    storageFailure,
  )
})

test('storage writes, wrong keys and JSON corruption prevent dispatch; builder failures preserve their original error', () => {
  const storage = memoryStorage()
  const attempt = createMutationAttempt({
    scope: 'reserve',
    storage: {
      ...storage,
      setItem: () => {
        throw Error('Quota')
      },
    },
    validate: valid,
    makeKey: () => 'original-key',
  })
  let dispatched = 0
  assert.throws(() => {
    attempt.freeze((idempotencyKey) => ({
      idempotencyKey,
      quantity: 2,
      nested: { name: 'Original' },
    }))
    dispatched++
  }, storageFailure)
  assert.equal(dispatched, 0)
  const normal = createMutationAttempt({
    scope: 'reserve',
    storage,
    validate: valid,
    makeKey: () => 'original-key',
  })
  assert.throws(
    () =>
      normal.freeze(() => ({
        idempotencyKey: 'different-key',
        quantity: 2,
        nested: { name: 'Original' },
      })),
    storageFailure,
  )
  assert.throws(
    () =>
      normal.freeze((idempotencyKey) => ({
        idempotencyKey,
        quantity: 2,
        nested: { name: 'Original' },
        toJSON: () => ({}),
      })),
    storageFailure,
  )
  const failure = new Error('Invalid draft')
  assert.throws(
    () =>
      normal.freeze(() => {
        throw failure
      }),
    (error) => error === failure,
  )
  assert.equal(normal.restore(), null)
})

test('known completion is retained in memory even if durable cleanup fails, and compatibility keys are cleared best effort', () => {
  const storage = memoryStorage()
  storage.setItem('ostatki:attempt:reserve', 'old-key')
  const attempt = createMutationAttempt({
    scope: 'reserve',
    storage,
    validate: valid,
    makeKey: () => 'original-key',
  })
  attempt.freeze((idempotencyKey) => ({
    idempotencyKey,
    quantity: 2,
    nested: { name: 'Original' },
  }))
  attempt.complete()
  assert.equal(storage.getItem('ostatki:attempt:reserve'), null)
  assert.equal(attempt.restore(), null)
  const failing = createMutationAttempt({
    scope: 'reserve',
    storage: {
      ...storage,
      removeItem: () => {
        throw Error('Cleanup failed')
      },
    },
    validate: valid,
    makeKey: () => 'next-key',
  })
  failing.freeze((idempotencyKey) => ({
    idempotencyKey,
    quantity: 1,
    nested: { name: 'Next' },
  }))
  assert.doesNotThrow(failing.complete)
  assert.equal(failing.restore(), null)
  assert.equal(
    JSON.parse(storage.getItem('ostatki:payload:reserve')!).idempotencyKey,
    'next-key',
  )
})

test('only definitive validation/state failures permit ending an uncertain attempt', () => {
  for (const status of [400, 409, 413, 415, 422])
    assert.equal(
      isDefinitiveMutationFailure(
        new ApiError('Rejected', 'INVALID_INPUT', status),
      ),
      true,
    )
  for (const status of [0, 401, 403, 404, 429, 500, 503])
    assert.equal(
      isDefinitiveMutationFailure(new ApiError('Uncertain', 'UNKNOWN', status)),
      false,
    )
  for (const code of ['IDEMPOTENCY_CONFLICT', 'STORAGE_UNAVAILABLE'])
    assert.equal(
      isDefinitiveMutationFailure(new ApiError('Retain', code, 409)),
      false,
    )
  assert.equal(isDefinitiveMutationFailure(new Error('Offline')), false)
})

test('a committed offer with a lost response survives later auth/rate failures and reload without creating a duplicate', () => {
  const now = Date.parse('2026-10-13T12:00:00Z')
  const repository = new Repository(':memory:', now, { seedFixtures: true })
  const service = new MarketplaceService(repository, () => now, {
    allowPersonaSessions: true,
  })
  const storage = memoryStorage()
  type OfferAttempt = CreateOfferInput & { idempotencyKey: string }
  const validate = (value: unknown): value is OfferAttempt => {
    const input = value as Partial<OfferAttempt> | null
    return (
      !!input &&
      typeof input === 'object' &&
      typeof input.idempotencyKey === 'string' &&
      typeof input.title === 'string' &&
      typeof input.price === 'number' &&
      typeof input.translations === 'object'
    )
  }
  const options = {
    scope: 'owner:goa-food:create-offer',
    storage,
    validate,
    makeKey: () => 'durable-offer-key',
  }
  const attempt = createMutationAttempt(options)
  const translation = {
    title: 'Evening meal',
    description: 'A freshly prepared meal.',
    guarantee: 'One complete meal.',
    allergens: [],
  }
  try {
    const initialCount = repository.offers('goa-food').length
    const original = attempt.freeze((idempotencyKey) => ({
      ...translation,
      idempotencyKey,
      kind: 'specific_item',
      price: 1000,
      originalPrice: 2000,
      totalQuantity: 3,
      image: '/images/goa-food.png',
      pickupStart: new Date(now + 3_600_000).toISOString(),
      pickupEnd: new Date(now + 7_200_000).toISOString(),
      translations: { ru: translation, kk: translation, en: translation },
    }))
    const committed = service.createOffer(SEED_USERS.cafe, original).offer
    // The browser did not receive this successful response.
    for (const status of [401, 403, 429]) {
      assert.equal(
        isDefinitiveMutationFailure(
          new ApiError('Retry later', 'FORBIDDEN', status),
        ),
        false,
      )
      const reloaded = createMutationAttempt(options)
      assert.deepEqual(reloaded.restore(), original)
      const retry = reloaded.freeze(() =>
        assert.fail('Unknown outcome cannot build an edited draft'),
      )
      assert.equal(
        service.createOffer(SEED_USERS.cafe, retry).offer.id,
        committed.id,
      )
      assert.equal(repository.offers('goa-food').length, initialCount + 1)
    }
    const final = createMutationAttempt(options)
    final.complete()
    assert.equal(final.restore(), null)
    assert.equal(
      storage.getItem('ostatki:payload:owner:goa-food:create-offer'),
      null,
    )
  } finally {
    repository.close()
  }
})
