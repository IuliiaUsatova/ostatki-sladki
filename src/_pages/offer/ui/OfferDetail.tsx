'use client'

import { useOfferText } from '@/entities/offer'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Offer, Order, User } from '@/shared/api'
import {
  api,
  ApiError,
  attemptKey,
  clearAttempt,
  useResource,
} from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { BuyerShell } from '@/shared/ui/app-shell'
import { BuyerLoginNotice, ErrorState, Loading } from '@/shared/ui/feedback'
import { VerificationNotice } from '@/features/account-security'
import { useVenueI18n } from '@/entities/venue'

export default function OfferDetail({ id }: { id: string }) {
  const { t } = useI18n()
  const resource = useResource<{ offer: Offer; serverNow: string }>(
    `/api/offers/${encodeURIComponent(id)}`,
  )
  const session = useResource<{ user: User | null }>('/api/session')
  if (resource.loading || session.loading)
    return (
      <BuyerShell title={t('catalog')} back="/" nav={false}>
        <Loading />
      </BuyerShell>
    )
  if (resource.error || session.error)
    return (
      <BuyerShell title={t('catalog')} back="/" nav={false}>
        <ErrorState
          error={resource.error ?? session.error}
          retry={() => {
            resource.reload()
            session.reload()
          }}
        />
      </BuyerShell>
    )
  return (
    resource.data && (
      <OfferView
        key={`${id}:${session.data?.user?.id ?? 'guest'}`}
        offer={resource.data.offer}
        serverNow={resource.data.serverNow}
        user={session.data?.user ?? null}
      />
    )
  )
}

function OfferView({
  offer,
  serverNow,
  user,
}: {
  offer: Offer
  serverNow: string
  user: User | null
}) {
  const { t, formatMoney, formatTime, formatDate, formatDistance, errorText } =
    useI18n()
  const offerText = useOfferText()
  const router = useRouter()
  const { t: venueText } = useVenueI18n()
  const scope = `reserve:${user?.id}:${offer.id}`
  const payloadStorage = `ostatki:payload:${scope}`
  const [uncertain, setUncertain] = useState<{
    quantity: number
    idempotencyKey: string
  } | null>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(payloadStorage) ?? 'null')
      return saved &&
        Number.isInteger(saved.quantity) &&
        saved.quantity > 0 &&
        typeof saved.idempotencyKey === 'string'
        ? saved
        : null
    } catch {
      return null
    }
  })
  const [quantity, setQuantity] = useState(uncertain?.quantity ?? 1)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const available =
    offer.status === 'published' &&
    offer.available >= quantity &&
    new Date(offer.pickupEnd).getTime() > new Date(serverNow).getTime()
  async function reserve() {
    if (!offer || pending) return
    setPending(true)
    setFailure(null)
    try {
      const payload = uncertain ?? {
        quantity,
        idempotencyKey: attemptKey(scope),
      }
      try {
        sessionStorage.setItem(payloadStorage, JSON.stringify(payload))
      } catch {
        throw new ApiError(
          'Attempt storage unavailable',
          'STORAGE_UNAVAILABLE',
          400,
        )
      }
      setUncertain(payload)
      const result = await api<{ order: Order }>('/api/reservations', {
        method: 'POST',
        body: JSON.stringify({ offerId: offer.id, ...payload }),
      })
      clearAttempt(scope)
      try {
        sessionStorage.removeItem(payloadStorage)
      } catch {
        /* The known result can still be opened. */
      }
      router.push(`/orders/${result.order.id}`)
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code !== 'STORAGE_UNAVAILABLE' &&
        error.status > 0 &&
        error.status < 500
      ) {
        clearAttempt(scope)
        try {
          sessionStorage.removeItem(payloadStorage)
        } catch {
          /* A later retry retains the same safe attempt. */
        }
        setUncertain(null)
      }
      setFailure(error)
    } finally {
      setPending(false)
    }
  }
  const canReserve = user?.role === 'buyer'
  const text = offerText(offer)
  return (
    <BuyerShell
      title={text.title}
      back="/"
      nav={false}
      footer={
        canReserve ? (
          <button
            className="button"
            disabled={
              pending ||
              user?.emailVerified === false ||
              (!available && !uncertain)
            }
            onClick={reserve}
          >
            {pending
              ? t('loading')
              : uncertain
                ? t('retry')
                : available
                  ? `${t('reserve')} · ${formatMoney(offer.price * quantity)}`
                  : t('soldOut')}
          </button>
        ) : undefined
      }
    >
      <>
        {user && <VerificationNotice user={user} />}
        <img
          className="detail-hero"
          src={
            offer.kind === 'surprise_bag' && offer.venueId === 'goa-food'
              ? '/images/goa-interior.png'
              : offer.image
          }
          alt=""
          width="362"
          height="212"
        />
        <span className="badge">
          {t(offer.kind === 'surprise_bag' ? 'bag' : 'dish')} ·{' '}
          {t('discount', {
            percent: Math.round((1 - offer.price / offer.originalPrice) * 100),
          })}
        </span>
        <h2 className="venue-heading">
          <Link href={`/venues/${encodeURIComponent(offer.venueId)}`}>
            {offer.venueName}
          </Link>
        </h2>
        <Link
          className="small blue"
          href={`/venues/${encodeURIComponent(offer.venueId)}`}
        >
          {venueText('publicLink')}
        </Link>
        <p className="small">
          {offer.address}
          {offer.distanceKm !== null && (
            <> · {formatDistance(offer.distanceKm)}</>
          )}
        </p>
        <div className="detail-row">
          <div>
            <p>
              {t('pickupWindow')} · {formatDate(offer.pickupStart)}
            </p>
            <p className="small">
              {formatTime(offer.pickupStart)}–{formatTime(offer.pickupEnd)}
            </p>
          </div>
          <strong className="blue">{formatMoney(offer.price)}</strong>
        </div>
        <section className="notice">
          <h2>{t(offer.kind === 'surprise_bag' ? 'everyBag' : 'exactMeal')}</h2>
          <p>{text.description}</p>
          <p>{text.guarantee}</p>
          {offer.kind === 'surprise_bag' && <p>{t('unknownContents')}</p>}
        </section>
        <section className="allergy-copy">
          <h3>{t('allergies')}</h3>
          <p>{text.allergens.join(' · ')}</p>
          <p className="small">{t('allergyHint')}</p>
        </section>
        <p className="blue">{t('available', { count: offer.available })}</p>
        {(offer.available > 0 || uncertain) && (
          <div className="quantity-field">
            <label>{t('quantity')}</label>
            <div className="stepper">
              <button
                aria-label={t('decrease')}
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                disabled={quantity <= 1 || pending || !!uncertain}
              >
                −
              </button>
              <output>{quantity}</output>
              <button
                aria-label={t('increase')}
                onClick={() => setQuantity((value) => value + 1)}
                disabled={
                  quantity >= Math.min(offer.available, 10) ||
                  pending ||
                  !!uncertain
                }
              >
                +
              </button>
            </div>
          </div>
        )}
        {failure !== null && (
          <div role="alert" className="notice danger">
            <p>{errorText(failure)}</p>
            <button
              className="button secondary"
              onClick={reserve}
              disabled={pending}
            >
              {t('retry')}
            </button>
          </div>
        )}
        {uncertain && failure === null && !pending && (
          <section className="notice">
            <p>{t('confirmingHint')}</p>
            <button className="button secondary" onClick={reserve}>
              {t('retry')}
            </button>
          </section>
        )}
        {!user || !canReserve ? (
          <BuyerLoginNotice returnTo={`/offers/${offer.id}`} />
        ) : null}
      </>
    </BuyerShell>
  )
}
