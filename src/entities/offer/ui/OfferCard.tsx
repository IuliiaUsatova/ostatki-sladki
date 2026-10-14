'use client'

import { useOfferText } from '../model/use-offer-text'

import Link from 'next/link'
import type { Offer } from '@/shared/api'
import { useI18n } from '@/shared/i18n'

export default function OfferCard({ offer }: { offer: Offer }) {
  const { t, formatMoney, formatTime, formatDistance } = useI18n()
  const offerText = useOfferText()
  const text = offerText(offer)
  return (
    <Link href={`/offers/${offer.id}`} className="offer-card">
      <img
        className="offer-photo"
        src={offer.image}
        alt=""
        width="96"
        height="108"
      />
      <div className="offer-copy">
        <h3>{offer.venueName}</h3>
        <p className="small">
          {text.title} · {t(offer.kind === 'surprise_bag' ? 'bag' : 'dish')}
        </p>
        <strong className="offer-price">{formatMoney(offer.price)}</strong>
        <p className="small">
          {formatTime(offer.pickupStart)}–{formatTime(offer.pickupEnd)}
          {offer.distanceKm !== null && (
            <> · {formatDistance(offer.distanceKm)}</>
          )}
        </p>
        <p className="small blue">
          {t('available', { count: offer.available })}
        </p>
      </div>
    </Link>
  )
}
