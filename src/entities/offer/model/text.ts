import type { Locale, Offer, OrderSnapshot } from '@/shared/api'

export function selectOfferTranslation(
  offer: Offer | OrderSnapshot,
  locale: Locale,
) {
  return offer.translations[locale]
}
