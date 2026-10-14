import { invariant } from './errors.ts'
import type {
  Locale,
  OpeningHoursDay,
  VenueProfileContent,
  VenueProfileTranslation,
} from './types.ts'
import { integer, keys, object, photoId, text } from './validation.ts'
import { geoPoint } from './geography.ts'

function hours(value: unknown): OpeningHoursDay {
  const input = object(value)
  keys(input, ['day', 'closed', 'opens', 'closes'])
  const day = integer(input.day, 'день недели', 0, 6)
  invariant(
    typeof input.closed === 'boolean',
    'INVALID_INPUT',
    'Укажите рабочие дни.',
  )
  if (input.closed) {
    invariant(
      input.opens === '' && input.closes === '',
      'INVALID_INPUT',
      'Для выходного дня часы должны быть пустыми.',
    )
    return { day, closed: true, opens: '', closes: '' }
  }
  invariant(
    typeof input.opens === 'string' &&
      typeof input.closes === 'string' &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.opens) &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(input.closes) &&
      input.opens < input.closes,
    'INVALID_INPUT',
    'Проверьте часы работы: время открытия должно быть раньше закрытия.',
  )
  return { day, closed: false, opens: input.opens, closes: input.closes }
}

export function venueProfile(value: unknown): VenueProfileContent {
  const input = object(value)
  keys(input, ['translations', 'openingHours', 'photoIds', 'location'])
  const translations = object(input.translations)
  keys(translations, ['ru', 'kk', 'en'])
  const localized = Object.fromEntries(
    (['ru', 'kk', 'en'] as const).map((locale) => {
      const content = object(translations[locale])
      keys(content, ['description', 'pickupInstructions'])
      return [
        locale,
        {
          description: text(
            content.description,
            `описание ${locale}`,
            1500,
            20,
          ),
          pickupInstructions: text(
            content.pickupInstructions,
            `самовывоз ${locale}`,
            800,
            5,
          ),
        },
      ]
    }),
  ) as Record<Locale, VenueProfileTranslation>
  invariant(
    Array.isArray(input.openingHours) && input.openingHours.length === 7,
    'INVALID_INPUT',
    'Укажите часы для всех семи дней.',
  )
  const openingHours = input.openingHours
    .map(hours)
    .sort((a, b) => a.day - b.day)
  invariant(
    new Set(openingHours.map((item) => item.day)).size === 7,
    'INVALID_INPUT',
    'Каждый день недели должен быть указан один раз.',
  )
  invariant(
    Array.isArray(input.photoIds) && input.photoIds.length <= 8,
    'INVALID_INPUT',
    'В галерее может быть не более восьми фотографий.',
  )
  const photoIds = input.photoIds.map(photoId)
  invariant(
    new Set(photoIds).size === photoIds.length,
    'INVALID_INPUT',
    'Фотографии не должны повторяться.',
  )
  return {
    translations: localized,
    openingHours,
    photoIds,
    ...(Object.hasOwn(input, 'location')
      ? { location: input.location === null ? null : geoPoint(input.location) }
      : {}),
  }
}

export function venueProfilePatch(value: unknown) {
  const input = object(value)
  keys(input, ['expectedRevision', 'profile'])
  return {
    expectedRevision: integer(
      input.expectedRevision,
      'версия заявки',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    profile: venueProfile(input.profile),
  }
}
