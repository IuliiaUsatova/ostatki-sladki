'use client'

import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { venueMessages } from './messages'

export function useVenueI18n() {
  const { locale, errorText } = useI18n()
  const t = (key: string, values: Record<string, string | number> = {}) =>
    (venueMessages[locale][key] ?? venueMessages.en[key] ?? key).replace(
      /\{(\w+)\}/g,
      (_, name: string) => String(values[name] ?? `{${name}}`),
    )
  return {
    locale,
    t,
    error: (value: unknown) => {
      if (value instanceof ApiError) {
        if (value.code === 'EMAIL_NOT_VERIFIED') return t('emailRequired')
        if (['MODERATION_CONFLICT', 'PROFILE_CONFLICT'].includes(value.code))
          return t('conflict')
        if (value.status === 0 || value.status >= 500) return t('unknown')
        if (
          ['INVALID_IMAGE', 'IMAGE_TOO_LARGE', 'UNSUPPORTED_IMAGE'].includes(
            value.code,
          )
        )
          return t('fileInvalid')
      }
      return errorText(value)
    },
  }
}
