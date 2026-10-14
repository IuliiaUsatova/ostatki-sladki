'use client'

import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { orderLifecycleMessages } from './messages'

export function useLifecycleI18n() {
  const context = useI18n()
  const t = (key: string) =>
    orderLifecycleMessages[context.locale][key] ??
    orderLifecycleMessages.en[key] ??
    key
  return {
    ...context,
    t,
    when: (at: string) =>
      `${context.formatDate(at)}, ${context.formatTime(at)}`,
    error: (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.code === 'STORAGE_UNAVAILABLE') return t('storageError')
        if (error.code === 'ISSUE_MESSAGE_LIMIT') return t('limit')
        if (
          [
            'ISSUE_ALREADY_EXISTS',
            'ISSUE_STATE_CONFLICT',
            'ISSUE_REVISION_CONFLICT',
          ].includes(error.code)
        )
          return t('conflict')
        if (error.code === 'ORDER_STATE_CONFLICT') return t('changedOrder')
      }
      return context.errorText(error)
    },
  }
}
