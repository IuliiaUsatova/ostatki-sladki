'use client'

import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { supportAdminMessages } from './messages'

export function useSupportI18n() {
  const i18n = useI18n()
  const t = (key: string) =>
    supportAdminMessages[i18n.locale][key] ??
    supportAdminMessages.en[key] ??
    key
  return {
    ...i18n,
    t,
    when: (at: string) => `${i18n.formatDate(at)}, ${i18n.formatTime(at)}`,
    error: (error: unknown) => {
      if (!(error instanceof ApiError)) return t('genericError')
      if (error.code === 'STORAGE_UNAVAILABLE') return t('storageError')
      if (error.status === 0 || error.status >= 500) return t('networkError')
      if (error.code === 'ISSUE_MESSAGE_LIMIT') return t('messageLimit')
      if (error.status === 409) return t('conflict')
      if (error.status === 401) return t('authError')
      if (error.status === 403) return t('denied')
      if (error.status === 404) return t('notFound')
      if (error.status === 429) return t('rateLimit')
      if (error.status === 400 || error.status === 422) return t('invalid')
      return t('genericError')
    },
  }
}
