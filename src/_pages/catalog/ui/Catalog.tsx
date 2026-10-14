'use client'

import { useOfferText } from '@/entities/offer'

import Link from 'next/link'
import { useState } from 'react'
import type { Offer } from '@/shared/api'
import { useResource } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { BuyerShell } from '@/shared/ui/app-shell'
import { OfferCard } from '@/entities/offer'
import { ErrorState, Loading } from '@/shared/ui/feedback'

export default function Catalog() {
  const { t } = useI18n()
  const offerText = useOfferText()
  const { data, error, loading, reload } = useResource<{
    offers: Offer[]
    serverNow: string
  }>('/api/offers')
  const [kind, setKind] = useState('all')
  const [search, setSearch] = useState('')
  const offers =
    data?.offers.filter(
      (offer) =>
        (kind === 'all' || offer.kind === kind) &&
        `${offerText(offer).title} ${offer.venueName}`
          .toLocaleLowerCase()
          .includes(search.toLocaleLowerCase()),
    ) ?? []
  return (
    <BuyerShell title={t('homeTitle')}>
      <div className="location-row">
        <span>{t('city')}</span>
        <Link href="/nearby">{t('map')}</Link>
      </div>
      <p className="small section-caption">{t('pickupToday')}</p>
      <img
        className="catalog-hero"
        src="/images/bakery.png"
        width="362"
        height="140"
        alt=""
      />
      <div className="filter-tabs" role="group" aria-label={t('catalog')}>
        {[
          ['all', 'all'],
          ['specific_item', 'dishes'],
          ['surprise_bag', 'bags'],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={kind === value}
            className={kind === value ? 'selected' : ''}
            onClick={() => setKind(value)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <label className="search-field">
        <span className="sr-only">{t('search')}</span>
        <input
          type="search"
          placeholder={t('search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <h2 className="section-title">{t('today')}</h2>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : offers.length > 0 ? (
        <div className="offer-list">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <h2>{t('noOffers')}</h2>
          <p>{t('noOffersHint')}</p>
          <button
            className="button secondary"
            onClick={() => {
              setSearch('')
              setKind('all')
              reload()
            }}
          >
            {t('reset')}
          </button>
        </section>
      )}
    </BuyerShell>
  )
}
