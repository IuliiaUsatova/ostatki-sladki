'use client'

import { useRef, useState } from 'react'
import type { PhotoAsset } from '@/shared/api'
import { useVenueI18n } from '../model/i18n'
import { venueStyles as styles } from '@/shared/ui/venue-layout'

export default function Gallery({
  photos,
  name,
}: {
  photos: PhotoAsset[]
  name: string
}) {
  const { t } = useVenueI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState(0)
  const photo = photos[selected] ?? photos[0]
  if (!photo) return null
  function open(index: number) {
    setSelected(index)
    dialog.current?.showModal()
  }
  function move(direction: number) {
    setSelected((index) => (index + direction + photos.length) % photos.length)
  }
  return (
    <section className={styles.gallery} aria-label={t('gallery')}>
      <button
        className={styles.galleryCover}
        type="button"
        onClick={() => open(0)}
        aria-label={t('galleryOpen', { number: 1, total: photos.length })}
      >
        <img src={photos[0].url} alt={name} width="440" height="330" />
        {photos.length > 1 && (
          <span>{t('galleryCount', { number: 1, total: photos.length })}</span>
        )}
      </button>
      {photos.length > 1 && (
        <div className={styles.thumbnails}>
          {photos.slice(1).map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => open(index + 1)}
              aria-label={t('galleryOpen', {
                number: index + 2,
                total: photos.length,
              })}
            >
              <img
                src={item.url}
                alt=""
                width="100"
                height="75"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
      <dialog
        ref={dialog}
        className={styles.viewer}
        aria-label={`${name} · ${t('gallery')}`}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            move(-1)
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            move(1)
          }
        }}
      >
        <div className={styles.viewerHeader}>
          <h2>{name}</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={t('galleryClose')}
          >
            ×
          </button>
        </div>
        <img
          src={photo.url}
          alt={`${name} · ${t('photo', { number: selected + 1 })}`}
          width={photo.width}
          height={photo.height}
        />
        <div className={styles.viewerControls}>
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={photos.length < 2}
            aria-label={t('previousPhoto')}
          >
            ←
          </button>
          <span role="status">
            {t('galleryCount', { number: selected + 1, total: photos.length })}
          </span>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={photos.length < 2}
            aria-label={t('nextPhoto')}
          >
            →
          </button>
        </div>
      </dialog>
    </section>
  )
}
