'use client'

import type { PublicVenueResponse } from '@/shared/api'
import { useResource } from '@/shared/api'
import { BuyerShell } from '@/shared/ui/app-shell'
import { ErrorState, Loading } from '@/shared/ui/feedback'
import { OfferCard } from '@/entities/offer'
import { Gallery } from '@/entities/venue'
import { MapCanvas } from '@/shared/ui/map'
import { DirectionsLink } from '@/shared/ui/map'
import { mapMessages } from '@/shared/ui/map'
import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'

export default function PublicVenue({ id }: { id: string }) {
  const { t, locale } = useVenueI18n()
  const resource = useResource<PublicVenueResponse>(
    `/api/venues/${encodeURIComponent(id)}`,
  )
  const venue = resource.data?.venue
  const text = venue?.profile?.translations[locale]
  const offers =
    resource.data?.offers.filter(
      (offer) =>
        offer.available > 0 &&
        Date.parse(offer.pickupEnd) > Date.parse(resource.data!.serverNow),
    ) ?? []
  return (
    <BuyerShell title={venue?.name ?? t('profile')} back="/nearby">
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.reload} />
      ) : venue ? (
        <>
          <Gallery photos={venue.photos} name={venue.name} />
          <section className={styles.publicIdentity}>
            <h2>{venue.name}</h2>
            <p className={styles.address}>
              <img src="/icons/map.svg" alt="" width="18" height="18" />
              {venue.address}
            </p>
          </section>
          <section className={styles.publicSection}>
            <h2>{t('about')}</h2>
            <p className={styles.copy}>
              {text?.description ?? t('noDescription')}
            </p>
          </section>
          <section className={styles.publicSection}>
            <h2>{t('availableOffers')}</h2>
            {offers.length ? (
              <div className="offer-list">
                {offers.map((offer) => (
                  <OfferCard key={offer.id} offer={offer} />
                ))}
              </div>
            ) : (
              <p className={styles.hint}>{t('noOffers')}</p>
            )}
          </section>
          <section className={styles.publicSection}>
            <h2>{t('pickup')}</h2>
            <p className={styles.copy}>
              {text?.pickupInstructions ?? t('noPickup')}
            </p>
            <p className={styles.hint}>{t('pickupDisclaimer')}</p>
          </section>
          {venue.location && (
            <section className={styles.publicSection}>
              <h2>{mapMessages[locale].title}</h2>
              <MapCanvas
                points={[
                  { id: venue.id, name: venue.name, location: venue.location },
                ]}
                center={venue.location}
                selectedId={venue.id}
                ariaLabel={mapMessages[locale].title}
                height={280}
              />
              <DirectionsLink venue={venue} />
            </section>
          )}
          <section className={styles.publicSection}>
            <h2>{t('openingHours')}</h2>
            {venue.profile ? (
              <dl className={styles.publicHours}>
                {venue.profile.openingHours.map((row) => (
                  <div key={row.day}>
                    <dt>{t(`day${row.day}`)}</dt>
                    <dd>
                      {row.closed ? t('closed') : `${row.opens}–${row.closes}`}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className={styles.hint}>{t('noHours')}</p>
            )}
          </section>
        </>
      ) : null}
    </BuyerShell>
  )
}
