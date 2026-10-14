'use client'

import { useCallback } from 'react'
import type { Offer, OrderSnapshot } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { selectOfferTranslation } from './text'

export function useOfferText() {
  const { locale } = useI18n()
  return useCallback(
    (offer: Offer | OrderSnapshot) => selectOfferTranslation(offer, locale),
    [locale],
  )
}
