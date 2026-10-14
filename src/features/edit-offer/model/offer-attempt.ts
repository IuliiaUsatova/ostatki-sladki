import { ApiError } from '../../../shared/api/index.transport.ts'
import type {
  CreateOfferInput,
  PatchOfferInput,
} from '../../../shared/api/index.transport.ts'
import type { FrozenStorage } from '../../../shared/lib/frozen-attempt/index.ts'

export type OfferAttempt = {
  mode: 'create' | 'edit'
  idempotencyKey: string
  payload: CreateOfferInput | PatchOfferInput
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
export function isOfferAttempt(value: unknown): value is OfferAttempt {
  if (!value || typeof value !== 'object') return false
  const attempt = value as Partial<OfferAttempt>
  const p = attempt.payload
  if (
    !p ||
    typeof p !== 'object' ||
    typeof attempt.idempotencyKey !== 'string' ||
    !uuid.test(attempt.idempotencyKey)
  )
    return false
  if (
    !Number.isFinite(p.price) ||
    !Number.isInteger(p.totalQuantity) ||
    typeof p.pickupStart !== 'string' ||
    typeof p.pickupEnd !== 'string' ||
    !Number.isFinite(Date.parse(p.pickupStart)) ||
    !Number.isFinite(Date.parse(p.pickupEnd))
  )
    return false
  if (attempt.mode === 'edit')
    return (
      !('idempotencyKey' in p) &&
      'status' in p &&
      (p.status === 'published' || p.status === 'paused')
    )
  if (attempt.mode !== 'create' || !('translations' in p)) return false
  return (
    p.idempotencyKey === attempt.idempotencyKey &&
    (p.kind === 'surprise_bag' || p.kind === 'specific_item') &&
    Number.isFinite(p.originalPrice) &&
    typeof p.image === 'string' &&
    ['ru', 'kk', 'en'].every((language) => {
      const text = p.translations?.[language as keyof typeof p.translations]
      return (
        !!text &&
        typeof text.title === 'string' &&
        typeof text.description === 'string' &&
        typeof text.guarantee === 'string' &&
        Array.isArray(text.allergens) &&
        text.allergens.every((item) => typeof item === 'string')
      )
    })
  )
}

// Convert the old form's durable payload before the new protocol can create a key.
export function offerAttemptStorage(
  scope: string,
  editing: boolean,
  storage: FrozenStorage,
  makeKey = () => crypto.randomUUID(),
): FrozenStorage {
  const currentKey = `ostatki:payload:${scope}`
  const legacyKey = `ostatki:pending:${scope}`
  return {
    getItem(key) {
      const current = storage.getItem(key)
      if (current !== null || key !== currentKey) return current
      const legacy = storage.getItem(legacyKey)
      if (legacy === null) return null
      const payload: unknown = JSON.parse(legacy)
      const idempotencyKey =
        !editing &&
        payload &&
        typeof payload === 'object' &&
        'idempotencyKey' in payload
          ? payload.idempotencyKey
          : makeKey()
      const attempt = {
        mode: editing ? 'edit' : 'create',
        idempotencyKey,
        payload,
      }
      if (!isOfferAttempt(attempt))
        throw new ApiError(
          'Attempt storage unavailable',
          'STORAGE_UNAVAILABLE',
          400,
        )
      const serialized = JSON.stringify(attempt)
      storage.setItem(currentKey, serialized)
      return serialized
    },
    setItem: (key, value) => storage.setItem(key, value),
    removeItem(key) {
      storage.removeItem(key)
      if (key === currentKey) storage.removeItem(legacyKey)
    },
  }
}
