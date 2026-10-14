'use client'

import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { supportMessages } from './messages'

export function useSupportI18n() {
  const context = useI18n()
  const t = (key: string) =>
    supportMessages[context.locale][key] ?? supportMessages.en[key] ?? key
  return {
    ...context,
    t,
    when: (at: string) =>
      context.formatDate(at) + ', ' + context.formatTime(at),
    error: (value: unknown) => {
      if (value instanceof ApiError) {
        if (value.code === 'STORAGE_UNAVAILABLE') return t('storage')
        if (value.code.startsWith('SUPPORT_') && value.status === 409)
          return t('conflict')
        if (value.status === 401) return t('auth')
      }
      return context.errorText(value)
    },
  }
}
