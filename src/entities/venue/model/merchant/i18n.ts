'use client'
import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { merchantMessages } from './messages'
export function useMerchantI18n() {
  const { locale, formatMoney, formatTime, formatDate, errorText } = useI18n()
  const dictionary = merchantMessages[locale]
  return {
    locale,
    t: (key: string) => dictionary[key] ?? merchantMessages.en[key] ?? key,
    money: formatMoney,
    time: formatTime,
    date: formatDate,
    error: (value: unknown) => {
      const aliases: Record<string, string> = {
        PICKUP_NOT_FOUND: 'INVALID_PICKUP_CODE',
        OUTSIDE_PICKUP_WINDOW: 'PICKUP_WINDOW_CLOSED',
        IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_MISMATCH',
        ORDER_STATE_CONFLICT: 'ORDER_NOT_CONFIRMED',
      }
      const code =
        value instanceof ApiError
          ? (aliases[value.code] ?? value.code)
          : 'generic'
      return dictionary[`error.${code}`] ?? errorText(value)
    },
  }
}
