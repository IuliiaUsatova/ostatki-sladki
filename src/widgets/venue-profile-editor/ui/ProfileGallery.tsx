'use client'

import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import type { VenueProfileFormModel } from '../model/useVenueProfileForm'
import { PhotoUpload, PhotoLibrary } from '@/features/venue-media'
export function ProfileGallery({
  selectedPhotos,
  disabled,
  movePhoto,
  selectPhoto,
  setPhotos,
  photos,
  draft,
}: Pick<
  VenueProfileFormModel,
  | 'selectedPhotos'
  | 'disabled'
  | 'movePhoto'
  | 'selectPhoto'
  | 'setPhotos'
  | 'photos'
  | 'draft'
>) {
  const { t } = useVenueI18n()
  return (
    <section className={`${styles.panel} ${styles.section}`}>
      <div className={styles.sectionHeading}>
        <h2>{t('gallery')}</h2>
        <p>{t('galleryHint')}</p>
      </div>
      {selectedPhotos.length ? (
        <ol className={styles.orderedGallery}>
          {selectedPhotos.map((photo, index) => (
            <li key={photo.id} className={styles.orderedPhoto}>
              <img src={photo.url} alt="" width="320" height="240" />
              <div className={styles.photoMeta}>
                <span>{t('photo', { number: index + 1 })}</span>
                {index === 0 && (
                  <span className={styles.cover}>{t('cover')}</span>
                )}
              </div>
              <div className={styles.photoControls}>
                <button
                  type="button"
                  className={styles.photoAction}
                  aria-label={t('earlier', { number: index + 1 })}
                  disabled={disabled || index === 0}
                  onClick={() => movePhoto(index, -1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  className={styles.photoAction}
                  aria-label={t('later', { number: index + 1 })}
                  disabled={disabled || index === selectedPhotos.length - 1}
                  onClick={() => movePhoto(index, 1)}
                >
                  →
                </button>
                <button
                  type="button"
                  className={styles.photoAction}
                  aria-label={t('remove', { number: index + 1 })}
                  disabled={disabled}
                  onClick={() => selectPhoto(photo)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.hint}>{t('noGallery')}</p>
      )}
      <PhotoUpload
        disabled={disabled}
        onLibraryRefreshed={setPhotos}
        onUploaded={(photo) => setPhotos((previous) => [photo, ...previous])}
      />
      <h3>{t('library')}</h3>
      <PhotoLibrary
        photos={photos}
        selected={draft.photoIds}
        disabled={disabled}
        onSelect={selectPhoto}
      />
    </section>
  )
}
