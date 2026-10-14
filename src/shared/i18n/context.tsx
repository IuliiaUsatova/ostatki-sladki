'use client'

import { createContext, useCallback, useContext } from 'react'
import type { Locale } from '@/shared/api'
import { ApiError } from '@/shared/api'
import { messages } from './messages'

type I18nContextValue = { locale: Locale; setLocale: (locale: Locale) => void }
export const I18nContext = createContext<I18nContextValue | null>(null)
const locales = { ru: 'ru-KZ', kk: 'kk-KZ', en: 'en-GB' }

export function errorText(error: unknown, locale: Locale): string {
  const m = messages[locale]
  if (!(error instanceof ApiError)) return m.genericError
  if (error.code === 'EMAIL_NOT_VERIFIED') return m.emailNotVerified
  if (error.code === 'STORAGE_UNAVAILABLE') return m.storageError
  if (error.status === 0 || error.status >= 500) return m.networkError
  if (error.status === 401) return m.unauthorized
  if (error.status === 403) return m.forbidden
  if (['OUT_OF_STOCK', 'INSUFFICIENT_STOCK'].includes(error.code))
    return m.stockError
  if (['RESERVATION_EXPIRED', 'EXPIRED'].includes(error.code))
    return m.expiredHint
  if (
    [
      'CANCELLATION_CLOSED',
      'CANCEL_CUTOFF',
      'CANCELLATION_WINDOW_CLOSED',
    ].includes(error.code)
  )
    return m.cancelUnavailable
  if (['OFFER_UNAVAILABLE', 'OFFER_CLOSED'].includes(error.code))
    return m.unavailable
  if (error.status === 404) return m.notFound
  return error.status === 400 ? m.invalid : m.genericError
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('I18nProvider is required')
  const { locale } = context
  const t = useCallback(
    (key: string, values: Record<string, string | number> = {}) => {
      const text = messages[locale][key] ?? messages.en[key] ?? key
      return text.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(values[name] ?? `{${name}}`),
      )
    },
    [locale],
  )
  const formatMoney = useCallback(
    (amount: number) =>
      new Intl.NumberFormat(locale === 'kk' ? 'ru-KZ' : locales[locale], {
        style: 'currency',
        currency: 'KZT',
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      }).format(amount),
    [locale],
  )
  const formatTime = useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(locales[locale], {
        timeZone: 'Asia/Almaty',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(iso)),
    [locale],
  )
  const formatDate = useCallback(
    (iso: string) => {
      if (locale !== 'kk')
        return new Intl.DateTimeFormat(locales[locale], {
          timeZone: 'Asia/Almaty',
          day: 'numeric',
          month: 'short',
        }).format(new Date(iso))
      // Some WebViews lack Kazakh CLDR data and otherwise display months as “M10”.
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Almaty',
        day: 'numeric',
        month: 'numeric',
      }).formatToParts(new Date(iso))
      const day = parts.find((part) => part.type === 'day')?.value
      const month = Number(parts.find((part) => part.type === 'month')?.value)
      return `${day} ${['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'][month - 1]}`
    },
    [locale],
  )
  const formatDistance = useCallback(
    (distance: number) => {
      const meters = distance < 1
      const amount = meters ? distance * 1000 : distance
      const unit = meters
        ? locale === 'en'
          ? 'm'
          : 'м'
        : locale === 'en'
          ? 'km'
          : 'км'
      return `${new Intl.NumberFormat(locales[locale], { maximumFractionDigits: meters ? 0 : 1 }).format(amount)} ${unit}`
    },
    [locale],
  )
  return {
    ...context,
    t,
    formatMoney,
    formatTime,
    formatDate,
    formatDistance,
    errorText: (error: unknown) => errorText(error, locale),
  }
}
