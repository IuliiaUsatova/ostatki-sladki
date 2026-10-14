import { invariant } from './errors.ts'
import type {
  CreateOfferInput,
  Locale,
  OfferTranslation,
  PatchOfferInput,
  Persona,
} from './types.ts'

export const PERSONAS: readonly Persona[] = [
  'buyer',
  'buyer-other',
  'cafe',
  'cafe-other',
  'pickup',
  'cafe-pending',
]
export const OFFER_IMAGES = [
  '/images/goa-food.png',
  '/images/croissant.png',
  '/images/bakery.png',
  '/images/goa-interior.png',
]
export const PHOTO_ID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export function photoId(value: unknown): string {
  invariant(
    typeof value === 'string' && PHOTO_ID_PATTERN.test(value),
    'INVALID_INPUT',
    'Проверьте фотографию.',
  )
  return value
}

export function offerImage(value: unknown): string {
  invariant(
    typeof value === 'string' &&
      (OFFER_IMAGES.includes(value) ||
        (value.startsWith('/api/photos/') &&
          PHOTO_ID_PATTERN.test(value.slice('/api/photos/'.length)))),
    'INVALID_INPUT',
    'Выберите фотографию своего заведения.',
  )
  return value
}

export { object, keys } from '../shared/lib/validation/index.ts'
import { object, keys } from '../shared/lib/validation/index.ts'

export function text(
  value: unknown,
  label: string,
  max = 500,
  min = 1,
): string {
  invariant(
    typeof value === 'string' &&
      value.trim().length >= min &&
      value.trim().length <= max,
    'INVALID_INPUT',
    `Проверьте поле «${label}».`,
  )
  return value.trim()
}

export function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  invariant(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= min &&
      value <= max,
    'INVALID_INPUT',
    `Проверьте поле «${label}».`,
  )
  return value
}

export function idempotencyKey(value: unknown): string {
  const key = text(value, 'ключ запроса', 100, 8)
  invariant(
    /^[a-zA-Z0-9_-]+$/.test(key),
    'INVALID_INPUT',
    'Недопустимый ключ запроса.',
  )
  return key
}

export function pickupCode(value: unknown): string {
  invariant(
    typeof value === 'string' && /^\d{6}$/.test(value),
    'INVALID_INPUT',
    'Введите шестизначный код выдачи.',
  )
  return value
}

export function isoDate(value: unknown): string {
  invariant(
    typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T/.test(value) &&
      /(Z|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value)),
    'INVALID_INPUT',
    'Время должно содержать часовой пояс.',
  )
  return new Date(value).toISOString()
}

function allergens(value: unknown): string[] {
  invariant(
    Array.isArray(value) && value.length <= 12,
    'INVALID_INPUT',
    'Проверьте список аллергенов.',
  )
  return [...new Set(value.map((item) => text(item, 'аллерген', 100)))]
}

function translations(value: unknown): Record<Locale, OfferTranslation> {
  invariant(
    value &&
      typeof value === 'object' &&
      ['ru', 'kk', 'en'].every((locale) => Object.hasOwn(value, locale)),
    'INVALID_INPUT',
    'Заполните содержание предложения на русском, казахском и английском.',
  )
  const translationObject = object(value)
  keys(translationObject, ['ru', 'kk', 'en'])
  return Object.fromEntries(
    ['ru', 'kk', 'en'].map((locale) => {
      const entry = object(translationObject[locale])
      keys(entry, ['title', 'description', 'guarantee', 'allergens'])
      return [
        locale,
        {
          title: text(entry.title, 'название', 120),
          description: text(entry.description, 'описание', 1200),
          guarantee: text(entry.guarantee, 'состав', 500),
          allergens: allergens(entry.allergens),
        },
      ]
    }),
  ) as Record<Locale, OfferTranslation>
}

export function createOfferInput(value: unknown): CreateOfferInput {
  const input = object(value)
  keys(input, [
    'title',
    'kind',
    'description',
    'guarantee',
    'allergens',
    'price',
    'originalPrice',
    'totalQuantity',
    'image',
    'pickupStart',
    'pickupEnd',
    'translations',
    'idempotencyKey',
  ])
  invariant(
    input.kind === 'specific_item' || input.kind === 'surprise_bag',
    'INVALID_INPUT',
    'Выберите тип предложения.',
  )
  const result: CreateOfferInput = {
    title: text(input.title, 'название', 120),
    kind: input.kind,
    description: text(input.description, 'описание', 1200),
    guarantee: text(input.guarantee, 'состав', 500),
    allergens: allergens(input.allergens),
    price: integer(input.price, 'цена', 1, 1_000_000),
    originalPrice: integer(input.originalPrice, 'обычная цена', 1, 1_000_000),
    totalQuantity: integer(input.totalQuantity, 'количество', 1, 1000),
    image: offerImage(input.image),
    pickupStart: isoDate(input.pickupStart),
    pickupEnd: isoDate(input.pickupEnd),
    translations: translations(input.translations),
  }
  if (input.idempotencyKey !== undefined)
    result.idempotencyKey = idempotencyKey(input.idempotencyKey)
  invariant(
    result.price <= result.originalPrice,
    'INVALID_INPUT',
    'Цена со скидкой не может превышать обычную цену.',
  )
  return result
}

export function patchOfferInput(value: unknown): PatchOfferInput {
  const input = object(value)
  keys(input, [
    'totalQuantity',
    'status',
    'price',
    'pickupStart',
    'pickupEnd',
    'image',
  ])
  invariant(
    Object.keys(input).length > 0,
    'INVALID_INPUT',
    'Нет изменений для сохранения.',
  )
  const result: PatchOfferInput = {}
  if (input.totalQuantity !== undefined)
    result.totalQuantity = integer(input.totalQuantity, 'количество', 0, 1000)
  if (input.price !== undefined)
    result.price = integer(input.price, 'цена', 1, 1_000_000)
  if (input.status !== undefined) {
    invariant(
      input.status === 'published' || input.status === 'paused',
      'INVALID_INPUT',
      'Недопустимый статус предложения.',
    )
    result.status = input.status
  }
  if (input.pickupStart !== undefined)
    result.pickupStart = isoDate(input.pickupStart)
  if (input.pickupEnd !== undefined) result.pickupEnd = isoDate(input.pickupEnd)
  if (input.image !== undefined) result.image = offerImage(input.image)
  return result
}

export function pickupWindow(start: string, end: string, now: number) {
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  invariant(
    startMs < endMs &&
      endMs > now &&
      endMs - startMs <= 12 * 60 * 60_000 &&
      startMs >= now - 12 * 60 * 60_000 &&
      endMs <= now + 7 * 24 * 60 * 60_000,
    'INVALID_WINDOW',
    'Укажите действующее окно самовывоза продолжительностью до 12 часов.',
  )
}
