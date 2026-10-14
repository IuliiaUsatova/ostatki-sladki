import { invariant } from './errors.ts'
import { geoPoint } from './geography.ts'
import type { NearbySearchInput } from './types.ts'
import { keys, object } from './validation.ts'

export function nearbySearchInput(value: unknown): NearbySearchInput {
  const input = object(value)
  keys(input, ['center', 'radiusKm', 'search', 'kind'])
  invariant(
    Object.keys(input).length === 4,
    'INVALID_INPUT',
    'Укажите все параметры поиска.',
  )
  const center = input.center === null ? null : geoPoint(input.center)
  invariant(
    input.radiusKm === null ||
      (typeof input.radiusKm === 'number' &&
        Number.isFinite(input.radiusKm) &&
        input.radiusKm >= 1 &&
        input.radiusKm <= 50 &&
        center !== null),
    'INVALID_INPUT',
    'Выберите радиус от 1 до 50 километров и точку поиска.',
  )
  invariant(
    typeof input.search === 'string' && input.search.length <= 100,
    'INVALID_INPUT',
    'Поисковый запрос должен содержать не более 100 символов.',
  )
  invariant(
    input.kind === 'all' ||
      input.kind === 'specific_item' ||
      input.kind === 'surprise_bag',
    'INVALID_INPUT',
    'Выберите тип предложения.',
  )
  return {
    center,
    radiusKm: input.radiusKm,
    search: input.search.trim(),
    kind: input.kind,
  }
}
