'use client'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  api,
  ApiError,
  type Offer,
  type Locale,
  type OfferTranslation,
  type CreateOfferInput,
  type PatchOfferInput,
} from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import {
  useFrozenAttempt,
  isDefinitiveMutationFailure,
  type FrozenStorage,
} from '@/shared/lib/frozen-attempt'
import { blankTranslation, inputDate } from './draft'
import {
  isOfferAttempt,
  offerAttemptStorage,
  type OfferAttempt,
} from './offer-attempt'
export interface OfferEditorModelOptions {
  offer: Offer | null
  userId: string
  serverNow: string
  approved: boolean
  verified: boolean
  onSaved: (created: boolean) => void | Promise<void>
}
const browserStorage: FrozenStorage = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
}
export function useOfferEditor({
  offer,
  userId,
  serverNow,
  approved,
  verified,
  onSaved,
}: OfferEditorModelOptions) {
  const { locale } = useI18n()
  const [kind, setKind] = useState<CreateOfferInput['kind']>('surprise_bag')
  const [textLocale, setTextLocale] = useState<Locale>(locale)
  const [translations, setTranslations] = useState<
    Record<Locale, OfferTranslation>
  >({ ru: blankTranslation(), kk: blankTranslation(), en: blankTranslation() })
  const [allergenText, setAllergenText] = useState<Record<Locale, string>>({
    ru: '',
    kk: '',
    en: '',
  })
  const [price, setPrice] = useState(offer?.price.toString() ?? '')
  const [original, setOriginal] = useState('')
  const [quantity, setQuantity] = useState(
    offer?.totalQuantity.toString() ?? '1',
  )
  const [status, setStatus] = useState<Offer['status']>(
    offer?.status ?? 'published',
  )
  const [start, setStart] = useState(
    inputDate(
      offer?.pickupStart ??
        new Date(Date.parse(serverNow) + 60 * 60_000).toISOString(),
    ),
  )
  const [end, setEnd] = useState(
    inputDate(
      offer?.pickupEnd ??
        new Date(Date.parse(serverNow) + 120 * 60_000).toISOString(),
    ),
  )
  const [image, setImage] = useState(offer?.image ?? '')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [formError, setFormError] = useState(false)
  const [photoError, setPhotoError] = useState(false)
  const [committed, setCommitted] = useState(false)
  const lock = useRef(false)
  const knownCommit = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const scope = `merchant-offer:${userId}:${offer?.id ?? 'new'}`
  const storage = useMemo(
    () => offerAttemptStorage(scope, !!offer, browserStorage),
    [scope, offer],
  )
  const attempt = useFrozenAttempt(scope, isOfferAttempt, storage)
  const uncertain = !!attempt.attempt || !!attempt.failure
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    const value = attempt.attempt?.payload
    if (!value) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setPrice(String(value.price))
      setQuantity(String(value.totalQuantity))
      setStart(inputDate(value.pickupStart!))
      setEnd(inputDate(value.pickupEnd!))
      if (typeof value.image === 'string') setImage(value.image)
      if ('translations' in value) {
        setKind(value.kind)
        setOriginal(String(value.originalPrice))
        setTranslations(value.translations)
        setAllergenText({
          ru: value.translations.ru.allergens.join(', '),
          kk: value.translations.kk.allergens.join(', '),
          en: value.translations.en.allergens.join(', '),
        })
      } else if (value.status) setStatus(value.status)
    })
    return () => {
      active = false
    }
  }, [attempt.attempt])
  const updateText = (
    field: 'title' | 'description' | 'guarantee',
    value: string,
  ) =>
    setTranslations((current) => ({
      ...current,
      [textLocale]: { ...current[textLocale], [field]: value },
    }))
  function build(key: string): OfferAttempt {
    const pickupStart = new Date(`${start}:00+05:00`).toISOString()
    const pickupEnd = new Date(`${end}:00+05:00`).toISOString()
    const payload: CreateOfferInput | PatchOfferInput = offer
      ? {
          price: Number(price),
          totalQuantity: Number(quantity),
          status,
          pickupStart,
          pickupEnd,
          ...(image !== offer.image ? { image } : {}),
        }
      : {
          title: translations.ru.title,
          kind,
          description: translations.ru.description,
          guarantee: translations.ru.guarantee,
          allergens: allergenText.ru
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          translations: Object.fromEntries(
            Object.entries(translations).map(([language, text]) => [
              language,
              {
                ...text,
                allergens: allergenText[language as Locale]
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              },
            ]),
          ) as Record<Locale, OfferTranslation>,
          price: Number(price),
          originalPrice: Number(original),
          totalQuantity: Number(quantity),
          image,
          pickupStart,
          pickupEnd,
          idempotencyKey: key,
        }
    return { mode: offer ? 'edit' : 'create', idempotencyKey: key, payload }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      lock.current ||
      knownCommit.current ||
      !attempt.ready ||
      !approved ||
      !verified
    )
      return
    setFailure(null)
    setFormError(false)
    setPhotoError(false)
    if (!uncertain && !image) {
      setPhotoError(true)
      return
    }
    if (
      !offer &&
      !uncertain &&
      Object.values(translations).some(
        (value) =>
          !value.title.trim() ||
          !value.description.trim() ||
          !value.guarantee.trim(),
      )
    ) {
      setFormError(true)
      return
    }
    lock.current = true
    setBusy(true)
    const requestController = new AbortController()
    controller.current = requestController
    let success = false
    try {
      const frozen = attempt.freeze(build)
      await api(
        offer
          ? `/api/merchant/offers/${encodeURIComponent(offer.id)}`
          : '/api/merchant/offers',
        {
          method: offer ? 'PATCH' : 'POST',
          body: JSON.stringify(frozen.payload),
          signal: requestController.signal,
        },
      )
      if (requestController.signal.aborted) return
      knownCommit.current = true
      setCommitted(true)
      attempt.clear()
      success = true
    } catch (error) {
      if (requestController.signal.aborted) return
      setFailure(error)
      if (isDefinitiveMutationFailure(error)) attempt.clear()
      else if (error instanceof RangeError)
        setFailure(new ApiError('Invalid input', 'INVALID_INPUT', 400))
    } finally {
      if (!requestController.signal.aborted) {
        setBusy(false)
        lock.current = false
      }
    }
    if (success) {
      try {
        await onSaved(!offer)
      } catch (error) {
        if (!requestController.signal.aborted) setFailure(error)
      }
    }
  }
  return {
    kind,
    setKind,
    textLocale,
    setTextLocale,
    translations,
    allergenText,
    setAllergenText,
    price,
    setPrice,
    original,
    setOriginal,
    quantity,
    setQuantity,
    status,
    setStatus,
    start,
    setStart,
    end,
    setEnd,
    image,
    setImage,
    busy,
    failure: failure ?? attempt.failure,
    formError,
    photoError,
    setPhotoError,
    uncertain,
    committed,
    ready: attempt.ready,
    updateText,
    submit,
  }
}
