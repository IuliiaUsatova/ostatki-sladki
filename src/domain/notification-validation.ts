import { invariant } from './errors.ts'
import type { Locale, NotificationPreferences } from './types.ts'
import { keys, object, PHOTO_ID_PATTERN } from './validation.ts'

export type NotificationFilter = 'all' | 'unread'
export type NotificationCursor = { createdAt: string; id: string }

export function notificationId(value: unknown): string {
  invariant(
    typeof value === 'string' && PHOTO_ID_PATTERN.test(value),
    'INVALID_INPUT',
    'Недопустимый идентификатор уведомления.',
  )
  return value
}

export function notificationPreferencesInput(
  value: unknown,
): NotificationPreferences {
  const input = object(value)
  keys(input, ['emailEnabled', 'locale'])
  invariant(
    typeof input.emailEnabled === 'boolean',
    'INVALID_INPUT',
    'Выберите настройку писем.',
  )
  invariant(
    input.locale === 'ru' || input.locale === 'kk' || input.locale === 'en',
    'INVALID_INPUT',
    'Выберите язык писем.',
  )
  return { emailEnabled: input.emailEnabled, locale: input.locale as Locale }
}

export function notificationQuery(value: unknown): {
  limit: number
  filter: NotificationFilter
  cursor: NotificationCursor | null
} {
  const input = object(value)
  keys(input, ['limit', 'filter', 'cursor'])
  const limitText = input.limit ?? '20'
  invariant(
    typeof limitText === 'string' && /^(?:[1-9]|[1-4]\d|50)$/.test(limitText),
    'INVALID_INPUT',
    'Выберите от 1 до 50 уведомлений.',
  )
  const filter = input.filter ?? 'all'
  invariant(
    filter === 'all' || filter === 'unread',
    'INVALID_INPUT',
    'Выберите список уведомлений.',
  )
  const rawCursor = input.cursor
  if (rawCursor === undefined)
    return { limit: Number(limitText), filter, cursor: null }
  invariant(
    typeof rawCursor === 'string' &&
      rawCursor.length <= 256 &&
      /^[A-Za-z0-9_-]+$/.test(rawCursor),
    'INVALID_INPUT',
    'Не удалось прочитать следующую страницу.',
  )
  let decoded: unknown
  try {
    const bytes = Buffer.from(rawCursor, 'base64url')
    invariant(
      bytes.toString('base64url') === rawCursor,
      'INVALID_INPUT',
      'Не удалось прочитать следующую страницу.',
    )
    decoded = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
  } catch {
    invariant(
      false,
      'INVALID_INPUT',
      'Не удалось прочитать следующую страницу.',
    )
  }
  const cursor = object(decoded)
  keys(cursor, ['createdAt', 'id', 'filter'])
  invariant(
    cursor.filter === filter &&
      typeof cursor.createdAt === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cursor.createdAt) &&
      Number.isFinite(Date.parse(cursor.createdAt)) &&
      new Date(cursor.createdAt).toISOString() === cursor.createdAt,
    'INVALID_INPUT',
    'Не удалось прочитать следующую страницу.',
  )
  return {
    limit: Number(limitText),
    filter,
    cursor: { createdAt: cursor.createdAt, id: notificationId(cursor.id) },
  }
}

export function notificationReadAllInput(value: unknown): void {
  keys(object(value), [])
}
