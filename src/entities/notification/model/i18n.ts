'use client'

import { useI18n } from '@/shared/i18n'
import { notificationMessages } from './messages'

export function useNotificationI18n() {
  const context = useI18n()
  const t = (key: string, values: Record<string, string | number> = {}) =>
    (
      notificationMessages[context.locale][key] ??
      notificationMessages.en[key] ??
      key
    ).replace(/\{(\w+)\}/g, (_, name: string) =>
      String(values[name] ?? `{${name}}`),
    )
  return { ...context, t }
}
