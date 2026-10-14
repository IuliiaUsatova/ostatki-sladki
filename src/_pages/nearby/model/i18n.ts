'use client'

import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { nearbyMessages } from './messages'

export function useNearbyI18n() {
  const { locale, errorText } = useI18n()
  const t = (key: string, values: Record<string, string | number> = {}) =>
    (nearbyMessages[locale][key] ?? nearbyMessages.en[key] ?? key).replace(
      /\{(\w+)\}/g,
      (_, name: string) => String(values[name] ?? `{${name}}`),
    )
  return {
    locale,
    t,
    errorText: (error: unknown) =>
      error instanceof ApiError && error.status === 429
        ? t('rateLimit')
        : errorText(error),
  }
}
