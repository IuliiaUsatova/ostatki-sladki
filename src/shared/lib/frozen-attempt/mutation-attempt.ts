import { ApiError } from '../../api/index.transport.ts'

type AttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

type Options<T> = {
  scope: string
  storage: AttemptStorage
  validate: (value: unknown) => value is T
  makeKey?: () => string
}

function unavailable(): ApiError {
  return new ApiError('Attempt storage unavailable', 'STORAGE_UNAVAILABLE', 400)
}

function payloadKey(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null
  const direct = Object.hasOwn(value, 'idempotencyKey')
    ? (value as { idempotencyKey: unknown }).idempotencyKey
    : undefined
  if (direct !== undefined)
    return typeof direct === 'string' && direct.length > 0 ? direct : null
  const nested = Object.hasOwn(value, 'payload')
    ? (value as { payload: unknown }).payload
    : null
  if (
    typeof nested !== 'object' ||
    nested === null ||
    !Object.hasOwn(nested, 'idempotencyKey')
  )
    return null
  const key = (nested as { idempotencyKey: unknown }).idempotencyKey
  return typeof key === 'string' && key.length > 0 ? key : null
}

/** Durable payload ownership: an uncertain response never creates a new request. */
export function createMutationAttempt<T>({
  scope,
  storage,
  validate,
  makeKey = () => crypto.randomUUID(),
}: Options<T>): {
  restore(): T | null
  freeze(build: (key: string) => T): T
  complete(): void
} {
  const storageKey = `ostatki:payload:${scope}`
  let completed = false

  function parse(serialized: string): T {
    const value: unknown = JSON.parse(serialized)
    if (!payloadKey(value) || !validate(value)) throw unavailable()
    return value
  }

  function restore(): T | null {
    if (completed) return null
    try {
      const serialized = storage.getItem(storageKey)
      return serialized === null ? null : parse(serialized)
    } catch {
      // A malformed or unreadable original might already have reached the server.
      throw unavailable()
    }
  }

  return {
    restore,
    freeze(build) {
      const original = restore()
      if (original !== null) return original
      const key = makeKey()
      const value = build(key)
      try {
        if (payloadKey(value) !== key || !validate(value)) throw unavailable()
        const serialized = JSON.stringify(value)
        // Return the exact JSON request, detached from the caller's mutable draft.
        const payload = parse(serialized)
        if (payloadKey(payload) !== key) throw unavailable()
        storage.setItem(storageKey, serialized)
        completed = false
        return payload
      } catch {
        throw unavailable()
      }
    },
    complete() {
      completed = true
      for (const key of [storageKey, `ostatki:attempt:${scope}`]) {
        try {
          storage.removeItem(key)
        } catch {
          // The response proved completion; cleanup cannot turn it into an unknown result.
        }
      }
    },
  }
}

export function isDefinitiveMutationFailure(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    [400, 409, 413, 415, 422].includes(error.status) &&
    error.code !== 'IDEMPOTENCY_CONFLICT' &&
    error.code !== 'STORAGE_UNAVAILABLE'
  )
}
