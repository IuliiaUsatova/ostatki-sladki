'use client'

import type {
  Locale,
  PhotoAsset,
  VenueDetails,
  VenueProfileContent,
} from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { MapCanvas } from '@/shared/ui/map'
import { profileReviewMessages } from '../model/profileReviewMessages'
import { profileReviewStyles as styles } from '@/shared/ui/admin-layout'

const languages: Record<Locale, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}

export function VenueProfileReview({
  profile,
  timezone,
  photos,
}: {
  profile?: VenueProfileContent | null
  timezone?: string
  photos?: PhotoAsset[]
}) {
  const { locale } = useI18n()
  const t = (key: string) => profileReviewMessages[locale][key]
  const gallery =
    photos ??
    profile?.photoIds.map((id) => ({ id, url: `/api/photos/${id}` })) ??
    []
  return (
    <section className={styles.profile} aria-label={t('title')}>
      <h3>{t('title')}</h3>
      {!profile ? (
        <p className={styles.muted}>{t('noProfile')}</p>
      ) : (
        <>
          <div>
            <h4>{t('photographs')}</h4>
            {gallery.length ? (
              <ol className={styles.photos}>
                {gallery.map((photo, index) => (
                  <li key={photo.id}>
                    <a
                      href={photo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t('fullPhoto')} · ${index + 1}`}
                    >
                      {/* Review the original aspect ratio rather than hiding details in a crop. */}
                      <img
                        src={photo.url}
                        alt={`${t('photo')} ${index + 1}`}
                        loading="lazy"
                      />
                    </a>
                    <span>
                      {index === 0 ? t('cover') : `${t('photo')} ${index + 1}`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className={styles.muted}>{t('noPhotographs')}</p>
            )}
          </div>
          <div className={styles.copy}>
            {(Object.keys(languages) as Locale[]).map((language) => (
              <details key={language} open={language === locale}>
                <summary>{languages[language]}</summary>
                <dl lang={language}>
                  <div>
                    <dt>{t('description')}</dt>
                    <dd>{profile.translations[language].description}</dd>
                  </div>
                  <div>
                    <dt>{t('pickup')}</dt>
                    <dd>{profile.translations[language].pickupInstructions}</dd>
                  </div>
                </dl>
              </details>
            ))}
          </div>
          <div className={styles.hours}>
            <h4>{t('hours')}</h4>
            <p className={styles.muted}>
              {t('localHours')}
              {timezone ? ` · ${timezone}` : ''}
            </p>
            <dl>
              {profile.openingHours.map((day) => (
                <div key={day.day}>
                  <dt>{t(`day${day.day}`)}</dt>
                  <dd>
                    {day.closed ? t('closed') : `${day.opens}–${day.closes}`}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <div className={styles.location}>
            <h4>{t('location')}</h4>
            {profile.location ? (
              <>
                <p className={styles.muted}>{t('locationReviewHint')}</p>
                <dl className={styles.coordinates}>
                  <div>
                    <dt>{t('latitude')}</dt>
                    <dd>{profile.location.latitude}</dd>
                  </div>
                  <div>
                    <dt>{t('longitude')}</dt>
                    <dd>{profile.location.longitude}</dd>
                  </div>
                </dl>
                <MapCanvas
                  points={[
                    {
                      id: 'review',
                      name: t('location'),
                      location: profile.location,
                    },
                  ]}
                  center={profile.location}
                  selectedId="review"
                  height={250}
                  ariaLabel={t('locationMap')}
                />
              </>
            ) : (
              <p className={styles.muted}>{t('locationNotSet')}</p>
            )}
          </div>
        </>
      )}
    </section>
  )
}

export function ApplicationSnapshot({ snapshot }: { snapshot: VenueDetails }) {
  const { locale } = useI18n()
  const t = (key: string) => profileReviewMessages[locale][key]
  return (
    <details className={styles.snapshot}>
      <summary>{t('snapshot')}</summary>
      <dl className={styles.details}>
        <div>
          <dt>{t('name')}</dt>
          <dd>{snapshot.name}</dd>
        </div>
        <div>
          <dt>{t('address')}</dt>
          <dd>{snapshot.address}</dd>
        </div>
        <div>
          <dt>{t('description')}</dt>
          <dd>{snapshot.description || '—'}</dd>
        </div>
        <div>
          <dt>{t('contact')}</dt>
          <dd>{snapshot.contactPhone || '—'}</dd>
        </div>
      </dl>
      {snapshot.profile && <VenueProfileReview profile={snapshot.profile} />}
    </details>
  )
}
