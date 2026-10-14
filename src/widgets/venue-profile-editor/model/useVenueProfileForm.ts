'use client'

import { useRef, useState, type FormEvent } from 'react'
import { api, ApiError } from '@/shared/api'
import type {
  GeoPoint,
  Locale,
  PhotoAsset,
  VenueProfileContent,
  VenueProfileResponse,
} from '@/shared/api'
import {
  coordinateFields,
  coordinateValue,
  readLocation,
  blankProfile,
  languages,
  latitudeLimit,
} from './profile-fields'
import type { CoordinateFields } from './profile-fields'

export function useVenueProfileForm({
  initial,
  verified,
  onChanged,
  locale,
}: {
  initial: VenueProfileResponse
  verified: boolean
  onChanged: () => void
  locale: Locale
}) {
  const [current, setCurrent] = useState(initial)
  const [draft, setDraft] = useState<VenueProfileContent>(() =>
    structuredClone(initial.profile ?? blankProfile()),
  )
  const [locationFields, setLocationFields] = useState(() =>
    coordinateFields(initial.profile?.location),
  )
  const latitudeInput = useRef<HTMLInputElement>(null)
  const longitudeInput = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState(initial.photos)
  const [textLocale, setTextLocale] = useState<Locale>(locale)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const [success, setSuccess] = useState<'saved' | 'latestLoaded' | null>(null)
  const needsReload =
    failure instanceof ApiError &&
    (['MODERATION_CONFLICT', 'PROFILE_CONFLICT'].includes(failure.code) ||
      failure.status === 0 ||
      failure.status >= 500)
  const disabled = busy || !verified || needsReload
  const location = readLocation(locationFields)
  const changed =
    JSON.stringify(draft) !== JSON.stringify(current.profile) ||
    location === undefined
  const selectedPhotos = draft.photoIds
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is PhotoAsset => !!photo)

  function pickLocation(point: GeoPoint | null) {
    if (disabled) return
    const next = point
      ? {
          latitude: Math.max(
            -latitudeLimit,
            Math.min(latitudeLimit, Number(point.latitude.toFixed(5))),
          ),
          longitude: Number(point.longitude.toFixed(5)),
        }
      : null
    setLocationFields(coordinateFields(next))
    setDraft((previous) => ({ ...previous, location: next }))
    setChecked(false)
    setSuccess(null)
    setValidation(null)
  }
  function updateCoordinate(field: keyof CoordinateFields, value: string) {
    const next = { ...locationFields, [field]: value }
    setLocationFields(next)
    const point = readLocation(next)
    if (point !== undefined)
      setDraft((previous) => ({ ...previous, location: point }))
    setChecked(false)
    setSuccess(null)
    setValidation(null)
  }
  function normalizeCoordinates() {
    const point = readLocation(locationFields)
    if (point) pickLocation(point)
  }

  function updateText(
    field: 'description' | 'pickupInstructions',
    value: string,
  ) {
    setDraft((previous) => ({
      ...previous,
      translations: {
        ...previous.translations,
        [textLocale]: { ...previous.translations[textLocale], [field]: value },
      },
    }))
    setSuccess(null)
    setValidation(null)
    setChecked(false)
  }
  function selectPhoto(photo: PhotoAsset) {
    setValidation(null)
    setSuccess(null)
    setChecked(false)
    if (!draft.photoIds.includes(photo.id) && draft.photoIds.length >= 8) {
      setValidation('maxPhotos')
      return
    }
    setDraft((previous) => ({
      ...previous,
      photoIds: previous.photoIds.includes(photo.id)
        ? previous.photoIds.filter((id) => id !== photo.id)
        : [...previous.photoIds, photo.id],
    }))
  }
  function movePhoto(index: number, direction: number) {
    setDraft((previous) => {
      const ids = [...previous.photoIds]
      const next = index + direction
      if (next < 0 || next >= ids.length) return previous
      ;[ids[index], ids[next]] = [ids[next], ids[index]]
      return { ...previous, photoIds: ids }
    })
    setChecked(false)
    setSuccess(null)
  }
  function updateHours(
    day: number,
    patch: Partial<VenueProfileContent['openingHours'][number]>,
  ) {
    setDraft((previous) => ({
      ...previous,
      openingHours: previous.openingHours.map((row) =>
        row.day === day ? { ...row, ...patch } : row,
      ),
    }))
    setChecked(false)
    setSuccess(null)
    setValidation(null)
  }
  async function reloadLatest() {
    if (busy) return
    setBusy(true)
    try {
      const result = await api<VenueProfileResponse>('/api/merchant/profile')
      setCurrent(result)
      setPhotos((previous) =>
        [...previous, ...result.photos].filter(
          (photo, index, list) =>
            list.findIndex((item) => item.id === photo.id) === index,
        ),
      )
      setFailure(null)
      setChecked(false)
      setSuccess('latestLoaded')
      onChanged()
    } catch (value) {
      setFailure(value)
    } finally {
      setBusy(false)
    }
  }
  function replaceDraft() {
    setDraft(structuredClone(current.profile ?? blankProfile()))
    setLocationFields(coordinateFields(current.profile?.location))
    setChecked(false)
    setSuccess(null)
    setValidation(null)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || !checked || !changed) return
    setFailure(null)
    setValidation(null)
    if (location === undefined) {
      setValidation('invalidLocation')
      const input =
        coordinateValue(locationFields.latitude, latitudeLimit) === undefined
          ? latitudeInput
          : longitudeInput
      input.current?.focus()
      return
    }
    const missing = languages.find(
      (language) =>
        draft.translations[language].description.trim().length < 20 ||
        draft.translations[language].description.length > 1500 ||
        draft.translations[language].pickupInstructions.trim().length < 5 ||
        draft.translations[language].pickupInstructions.length > 800,
    )
    if (
      missing ||
      draft.openingHours.some(
        (row) =>
          !row.closed &&
          (!/^\d{2}:\d{2}$/.test(row.opens) ||
            !/^\d{2}:\d{2}$/.test(row.closes) ||
            row.opens >= row.closes),
      )
    ) {
      if (missing) setTextLocale(missing)
      setValidation('invalid')
      return
    }
    setBusy(true)
    try {
      const result = await api<VenueProfileResponse>('/api/merchant/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          expectedRevision: current.revision,
          profile: draft,
        }),
      })
      setCurrent(result)
      setDraft(structuredClone(result.profile ?? blankProfile()))
      setLocationFields(coordinateFields(result.profile?.location))
      setPhotos(result.photos)
      setChecked(false)
      setSuccess('saved')
      onChanged()
    } catch (value) {
      setFailure(value)
    } finally {
      setBusy(false)
    }
  }
  return {
    current,
    draft,
    locationFields,
    latitudeInput,
    longitudeInput,
    photos,
    setPhotos,
    textLocale,
    setTextLocale,
    checked,
    setChecked,
    busy,
    failure,
    validation,
    success,
    needsReload,
    disabled,
    location,
    changed,
    selectedPhotos,
    pickLocation,
    updateCoordinate,
    normalizeCoordinates,
    updateText,
    selectPhoto,
    movePhoto,
    updateHours,
    reloadLatest,
    replaceDraft,
    submit,
  }
}

export type VenueProfileFormModel = ReturnType<typeof useVenueProfileForm>
