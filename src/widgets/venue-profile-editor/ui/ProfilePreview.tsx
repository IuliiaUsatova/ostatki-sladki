'use client'

import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import type { VenueProfileFormModel } from '../model/useVenueProfileForm'
import Link from 'next/link'
export function ProfilePreview({
  selectedPhotos,
  current,
  draft,
  textLocale,
}: Pick<
  VenueProfileFormModel,
  'selectedPhotos' | 'current' | 'draft' | 'textLocale'
>) {
  const { t } = useVenueI18n()
  return (
    <aside
      className={`${styles.panel} ${styles.preview}`}
      aria-label={t('preview')}
    >
      <div>
        <h3>{t('preview')}</h3>
        <p className={styles.hint}>{t('draft')}</p>
      </div>
      {selectedPhotos[0] && (
        <img
          className={styles.previewPhoto}
          src={selectedPhotos[0].url}
          alt=""
          width="320"
          height="240"
        />
      )}
      <h2 className={styles.previewName}>{current.venue.name}</h2>
      <p className={styles.hint}>{current.venue.address}</p>
      <p className={styles.copy}>
        {draft.translations[textLocale].description || t('noDescription')}
      </p>
      <h3>{t('pickup')}</h3>
      <p className={styles.copy}>
        {draft.translations[textLocale].pickupInstructions || t('noPickup')}
      </p>
      {current.venue.status === 'approved' ? (
        <Link
          href={`/venues/${encodeURIComponent(current.venue.id)}`}
          className={styles.secondary}
        >
          {t('publicLink')}
        </Link>
      ) : (
        <p className={styles.hint}>{t('publicPending')}</p>
      )}
    </aside>
  )
}
