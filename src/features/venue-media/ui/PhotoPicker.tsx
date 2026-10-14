'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import type { PhotoAsset } from '@/shared/api'
import { api, ApiError, useResource } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'

export function PhotoUpload({
  disabled = false,
  onUploaded,
  onLibraryRefreshed,
}: {
  disabled?: boolean
  onUploaded: (photo: PhotoAsset) => void
  onLibraryRefreshed: (photos: PhotoAsset[]) => void
}) {
  const { t } = useVenueI18n()
  const { errorText } = useI18n()
  const inputId = useId()
  const fileInput = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [libraryChecked, setLibraryChecked] = useState(false)
  const [libraryFailure, setLibraryFailure] = useState(false)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    setSaved(false)
    setUncertain(false)
    setLibraryChecked(false)
    setLibraryFailure(false)
    setFailure(null)
    setFile(null)
    setPreview(null)
    if (!next) return
    if (next.size === 0) {
      setFailure('emptyFile')
      return
    }
    if (
      next.size > 6 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(next.type)
    ) {
      setFailure('fileInvalid')
      return
    }
    setFile(next)
    setPreview(URL.createObjectURL(next))
  }
  async function refreshLibrary(signal: AbortSignal) {
    try {
      const result = await api<{ photos: PhotoAsset[] }>(
        '/api/merchant/photos',
        { signal },
      )
      if (signal.aborted) return
      onLibraryRefreshed(result.photos)
      setLibraryChecked(true)
      setLibraryFailure(false)
    } catch {
      if (!signal.aborted) {
        setLibraryFailure(true)
        setLibraryChecked(false)
      }
    }
  }
  async function checkLibrary() {
    if (busy || disabled) return
    setBusy(true)
    const requestController = new AbortController()
    controller.current = requestController
    try {
      await refreshLibrary(requestController.signal)
    } finally {
      if (!requestController.signal.aborted) setBusy(false)
      if (controller.current === requestController) controller.current = null
    }
  }
  async function upload(confirmedRetry = false) {
    if (!file || busy || disabled || (uncertain && !confirmedRetry)) return
    setBusy(true)
    setFailure(null)
    setUncertain(false)
    setLibraryChecked(false)
    setLibraryFailure(false)
    const requestController = new AbortController()
    controller.current = requestController
    try {
      const result = await api<{ photo: PhotoAsset }>('/api/merchant/photos', {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': file.type },
        signal: requestController.signal,
      })
      if (requestController.signal.aborted) return
      onUploaded(result.photo)
      if (fileInput.current) fileInput.current.value = ''
      setFile(null)
      setPreview(null)
      setSaved(true)
    } catch (error) {
      if (!requestController.signal.aborted) {
        setFailure(error)
        if (
          error instanceof ApiError &&
          (error.status === 0 || error.status >= 500)
        ) {
          setUncertain(true)
          await refreshLibrary(requestController.signal)
        }
      }
    } finally {
      if (!requestController.signal.aborted) setBusy(false)
      if (controller.current === requestController) controller.current = null
    }
  }
  return (
    <section className={styles.upload} aria-busy={busy}>
      <label className={styles.chooseFile} htmlFor={inputId}>
        {t('chooseFile')}
      </label>
      <input
        id={inputId}
        ref={fileInput}
        className={styles.fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={choose}
        disabled={disabled || busy}
      />
      <p className={styles.hint}>{t('uploadHint')}</p>
      <p className={styles.hint}>{t('uploadPrivate')}</p>
      {file && preview && (
        <div className={styles.uploadPreview}>
          <img src={preview} alt="" width="96" height="80" />
          <div>
            <p>{file.name}</p>
            <p className={styles.hint}>
              {t('fileSize', { size: (file.size / 1024 / 1024).toFixed(2) })}
            </p>
          </div>
        </div>
      )}
      {failure !== null && !uncertain && (
        <p className={styles.error} role="alert">
          {typeof failure === 'string'
            ? t(failure)
            : failure instanceof ApiError &&
                failure.code === 'EMAIL_NOT_VERIFIED'
              ? t('emailRequired')
              : failure instanceof ApiError &&
                  ['PHOTO_TOO_LARGE', 'PHOTO_TYPE_UNSUPPORTED'].includes(
                    failure.code,
                  )
                ? t('fileInvalid')
                : failure instanceof ApiError &&
                    failure.code === 'PHOTO_INVALID'
                  ? t('photoInvalid')
                  : failure instanceof ApiError &&
                      failure.code === 'PHOTO_LIMIT_REACHED'
                    ? t('libraryLimit')
                    : failure instanceof ApiError && failure.status === 429
                      ? t('uploadRateLimited')
                      : failure instanceof ApiError && failure.status >= 500
                        ? t('uploadUnavailable')
                        : errorText(failure)}
        </p>
      )}
      {uncertain && (
        <div className={styles.notice} role="status">
          <p>{t('uploadUncertain')}</p>
          {libraryChecked && <p>{t('uploadLibraryRefreshed')}</p>}
          {libraryFailure && (
            <p className={styles.error} role="alert">
              {t('uploadLibraryUnavailable')}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={disabled || busy}
              onClick={checkLibrary}
            >
              {t(busy ? 'loading' : 'checkPhotoLibrary')}
            </button>
            {libraryChecked && (
              <button
                className={styles.secondary}
                type="button"
                disabled={disabled || busy}
                onClick={() => upload(true)}
              >
                {t('retryMissingPhoto')}
              </button>
            )}
          </div>
        </div>
      )}
      {saved && (
        <p className={styles.success} role="status">
          {t('uploadSaved')}
        </p>
      )}
      {file && !uncertain && (
        <button
          className={styles.primary}
          type="button"
          disabled={disabled || busy}
          onClick={() => upload()}
        >
          {t(busy ? 'uploading' : 'uploadAction')}
        </button>
      )}
    </section>
  )
}

export function PhotoLibrary({
  photos,
  selected,
  onSelect,
  disabled = false,
}: {
  photos: PhotoAsset[]
  selected: string[]
  onSelect: (photo: PhotoAsset) => void
  disabled?: boolean
}) {
  const { t } = useVenueI18n()
  if (photos.length === 0) return <p className={styles.hint}>{t('noPhotos')}</p>
  return (
    <div className={styles.photoGrid}>
      {photos.map((photo, index) => (
        <button
          key={photo.id}
          type="button"
          className={styles.photoChoice}
          aria-label={t('selectPhoto', { number: index + 1 })}
          aria-pressed={selected.includes(photo.id)}
          disabled={disabled}
          onClick={() => onSelect(photo)}
        >
          <img src={photo.url} alt="" width="180" height="135" loading="lazy" />
          <span>
            {selected.includes(photo.id)
              ? t('selected')
              : t('photo', { number: index + 1 })}
          </span>
        </button>
      ))}
    </div>
  )
}

export default function PhotoPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (url: string) => void
  disabled?: boolean
}) {
  const { t, error } = useVenueI18n()
  const resource = useResource<{ photos: PhotoAsset[] }>('/api/merchant/photos')
  const [added, setAdded] = useState<PhotoAsset[]>([])
  const photos = [...added, ...(resource.data?.photos ?? [])].filter(
    (photo, index, list) =>
      list.findIndex((item) => item.id === photo.id) === index,
  )
  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <h3>{t('chooseOfferPhoto')}</h3>
      </div>
      {value && !photos.some((photo) => photo.url === value) && (
        <div className={styles.uploadPreview}>
          <img src={value} alt="" width="96" height="80" />
          <p className={styles.hint}>{t('currentPhoto')}</p>
        </div>
      )}
      <PhotoUpload
        disabled={disabled}
        onUploaded={(photo) => setAdded((current) => [photo, ...current])}
        onLibraryRefreshed={(photos) => setAdded(photos)}
      />
      {resource.loading ? (
        <p role="status">{t('loading')}</p>
      ) : resource.error ? (
        <div className={styles.error} role="alert">
          <p>{error(resource.error)}</p>
          <button
            className={styles.secondary}
            type="button"
            onClick={resource.reload}
          >
            {t('retry')}
          </button>
        </div>
      ) : (
        <PhotoLibrary
          photos={photos}
          selected={photos
            .filter((photo) => photo.url === value)
            .map((photo) => photo.id)}
          onSelect={(photo) => onChange(photo.url)}
          disabled={disabled}
        />
      )}
    </section>
  )
}
