'use client'

import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { adminMessages } from './messages'

export function useAdminI18n() {
  const { locale, formatDate, formatTime } = useI18n()
  const dictionary = adminMessages[locale]
  const t = (key: string) => dictionary[key] ?? adminMessages.en[key] ?? key
  return {
    locale,
    t,
    when: (at: string) => `${formatDate(at)}, ${formatTime(at)}`,
    error: (value: unknown) =>
      value instanceof ApiError &&
      ['MODERATION_CONFLICT', 'MODERATION_STATE_CONFLICT'].includes(value.code)
        ? t('conflict')
        : value instanceof ApiError && value.status === 401
          ? t('sessionExpired')
          : value instanceof ApiError && value.status === 403
            ? t('denied')
            : value instanceof ApiError && value.status === 400
              ? t('invalid')
              : value instanceof ApiError &&
                  (value.status === 0 || value.status >= 500)
                ? t('unknown')
                : t('generic'),
  }
}
