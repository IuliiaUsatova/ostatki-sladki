import { invariant } from './errors.ts'
import { keys, object, text } from './validation.ts'
import type { Locale, ModerationAction, VenueDetails } from './types.ts'

export function email(value: unknown): string {
  const normalized = text(value, 'email', 254).toLowerCase()
  invariant(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized),
    'INVALID_INPUT',
    'Проверьте email.',
  )
  return normalized
}

export function password(value: unknown, registering: boolean): string {
  invariant(
    typeof value === 'string' &&
      Array.from(value).length >= (registering ? 15 : 1) &&
      Array.from(value).length <= 128 &&
      Buffer.byteLength(value, 'utf8') <= 512,
    'INVALID_INPUT',
    'Пароль должен содержать от 15 до 128 символов.',
  )
  return value
}

export function venueDetails(value: unknown): VenueDetails {
  const input = object(value)
  keys(input, ['name', 'address', 'description', 'contactPhone'])
  const result = {
    name: text(input.name, 'название заведения', 120),
    address: text(input.address, 'адрес', 300),
    description: text(input.description, 'описание заведения', 1500, 20),
    contactPhone: text(input.contactPhone, 'контактный телефон', 30, 7),
  }
  invariant(
    /^\+?[\d\s()-]{7,30}$/.test(result.contactPhone) &&
      result.contactPhone.replace(/\D/g, '').length >= 7 &&
      result.contactPhone.replace(/\D/g, '').length <= 15,
    'INVALID_INPUT',
    'Проверьте контактный телефон.',
  )
  return result
}

export function registration(value: unknown) {
  const input = object(value)
  keys(input, ['name', 'email', 'password', 'locale', 'accountType', 'venue'])
  invariant(
    input.locale === 'ru' || input.locale === 'kk' || input.locale === 'en',
    'INVALID_INPUT',
    'Выберите язык.',
  )
  invariant(
    input.accountType === 'buyer' || input.accountType === 'cafe',
    'INVALID_INPUT',
    'Выберите тип аккаунта.',
  )
  invariant(
    input.accountType === 'cafe' || input.venue === undefined,
    'INVALID_INPUT',
    'Данные заведения доступны владельцу кафе.',
  )
  return {
    name: text(input.name, 'имя', 120, 2),
    email: email(input.email),
    password: password(input.password, true),
    locale: input.locale as Locale,
    accountType: input.accountType,
    venue: input.accountType === 'cafe' ? venueDetails(input.venue) : null,
  }
}

export function login(value: unknown) {
  const input = object(value)
  keys(input, ['email', 'password'])
  return {
    email: email(input.email),
    password: password(input.password, false),
  }
}

function locale(value: unknown): Locale {
  invariant(
    value === 'ru' || value === 'kk' || value === 'en',
    'INVALID_INPUT',
    'Выберите язык.',
  )
  return value
}

export function verificationRequest(value: unknown) {
  const input = object(value)
  keys(input, ['locale'])
  return { locale: locale(input.locale) }
}

export function forgotPassword(value: unknown) {
  const input = object(value)
  keys(input, ['email', 'locale'])
  return { email: email(input.email), locale: locale(input.locale) }
}

function authToken(value: unknown): string {
  invariant(
    typeof value === 'string' && /^[a-zA-Z0-9_-]{43}$/.test(value),
    'INVALID_OR_EXPIRED_TOKEN',
    'Ссылка недействительна или срок её действия истёк.',
    400,
  )
  return value
}

export function verificationConfirmation(value: unknown) {
  const input = object(value)
  keys(input, ['token'])
  return { token: authToken(input.token) }
}

export function passwordReset(value: unknown) {
  const input = object(value)
  keys(input, ['token', 'password'])
  return {
    token: authToken(input.token),
    password: password(input.password, true),
  }
}

export function moderation(value: unknown) {
  const input = object(value)
  keys(input, ['action', 'expectedRevision', 'reasons'])
  invariant(
    ['approve', 'reject', 'request_changes', 'suspend'].includes(
      String(input.action),
    ),
    'INVALID_INPUT',
    'Выберите действие.',
  )
  const action = input.action as ModerationAction
  invariant(
    Number.isSafeInteger(input.expectedRevision) &&
      Number(input.expectedRevision) > 0,
    'INVALID_INPUT',
    'Проверьте версию заявки.',
  )
  let reasons: Record<Locale, string> | null = null
  if (input.reasons !== undefined) {
    const translations = object(input.reasons)
    keys(translations, ['ru', 'kk', 'en'])
    reasons = {
      ru: text(translations.ru, 'причина RU', 1500),
      kk: text(translations.kk, 'причина KK', 1500),
      en: text(translations.en, 'причина EN', 1500),
    }
  }
  invariant(
    action === 'approve' || reasons !== null,
    'INVALID_INPUT',
    'Укажите причину на трёх языках.',
  )
  return { action, expectedRevision: Number(input.expectedRevision), reasons }
}
