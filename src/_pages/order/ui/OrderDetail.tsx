'use client'

import { useOrderController } from '../model/use-order-controller'

import { CancellationSummary, OrderTimeline } from '@/entities/order'
import type { Order } from '@/shared/api'
import { useResource } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { BuyerShell } from '@/shared/ui/app-shell'
import { ErrorState, Loading } from '@/shared/ui/feedback'
import { IssuePanel } from '@/widgets/order-discussion'
import Link from 'next/link'
import { useEffect, useRef, type ReactNode } from 'react'

export default function OrderDetail({ id }: { id: string }) {
  const { t } = useI18n()
  const resource = useResource<{ order: Order; serverNow: string }>(
    `/api/orders/${encodeURIComponent(id)}`,
  )
  if (resource.loading)
    return (
      <BuyerShell title={t('checkout')} back="/orders" nav={false}>
        <Loading />
      </BuyerShell>
    )
  if (resource.error)
    return (
      <BuyerShell title={t('orders')} back="/orders" nav={false}>
        <ErrorState error={resource.error} retry={resource.reload} />
      </BuyerShell>
    )
  return (
    resource.data && (
      <OrderView
        key={resource.data.order.id}
        order={resource.data.order}
        serverNow={resource.data.serverNow}
        reload={resource.reload}
      />
    )
  )
}

function OrderView({
  order,
  serverNow,
  reload,
}: {
  order: Order
  serverNow: string
  reload: () => void
}) {
  const {
    t,
    formatMoney,
    formatTime,
    formatDate,
    errorText,
    lifecycleText,
    pending,
    failure,
    askCancel,
    setAskCancel,
    now,
    seconds,
    expired,
    held,
    canCancel,
    text,
    title,
    act,
    needsVerification,
  } = useOrderController({ order, serverNow, reload })
  const footer =
    held && needsVerification ? (
      <Link className="button" href="/verify-email">
        {t('verifyEmail')}
      </Link>
    ) : held ? (
      <button
        className="button"
        disabled={pending || expired || seconds === 0}
        onClick={() => act('confirm')}
      >
        {pending
          ? t('processing')
          : t('confirm', { price: formatMoney(order.total) })}
      </button>
    ) : (
      <Link
        className="button secondary"
        href={
          expired ||
          order.status === 'cancelled' ||
          order.status === 'not_collected' ||
          order.status === 'collected'
            ? '/'
            : '/orders'
        }
      >
        {t(
          expired ||
            order.status === 'cancelled' ||
            order.status === 'not_collected' ||
            order.status === 'collected'
            ? 'browse'
            : 'orders',
        )}
      </Link>
    )
  return (
    <BuyerShell title={title} back="/orders" nav={false} footer={footer}>
      {order.status === 'confirmed' && (
        <span className="badge success">
          {now < Date.parse(order.snapshot.pickupStart)
            ? t('notReady')
            : now >= Date.parse(order.snapshot.pickupEnd)
              ? t('pickupEnded')
              : t('confirmed')}
        </span>
      )}
      {order.status === 'confirmed' &&
        now < Date.parse(order.snapshot.pickupEnd) &&
        order.pickupCode && (
          <section className="pickup-ticket">
            <img src="/icons/orders-active.svg" width="36" height="36" alt="" />
            <h2>{t('code')}</h2>
            <p className="pickup-code">
              {order.pickupCode.replace(/(.{3})(.*)/, '$1 $2')}
            </p>
            <p>
              {order.number} · {text.title} × {order.quantity}
            </p>
            <p className="small">{t('showCode')}</p>
          </section>
        )}
      {order.status !== 'confirmed' && (
        <div className="offer-card static">
          <img
            className="offer-photo"
            src={order.snapshot.image}
            alt=""
            width="96"
            height="108"
          />
          <div className="offer-copy">
            <h3>{text.title}</h3>
            <p className="small">
              {order.snapshot.venueName} · {order.number}
            </p>
            <strong className="offer-price">{formatMoney(order.total)}</strong>
            <p className="small">
              {formatTime(order.snapshot.pickupStart)}–
              {formatTime(order.snapshot.pickupEnd)}
            </p>
            <p className="small blue">
              {order.quantity} × {formatMoney(order.snapshot.price)}
            </p>
          </div>
        </div>
      )}
      {held && (
        <section className="notice" role="status">
          <h2>{t('hold')}</h2>
          <p>
            {t('remaining', {
              time: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
            })}
          </p>
        </section>
      )}
      {expired && (
        <section className="notice danger">
          <h2>{t('expired')}</h2>
          <p>{t('expiredHint')}</p>
        </section>
      )}
      {order.status === 'collected' && (
        <section className="notice success">
          <h2>{t('collected')}</h2>
          <p>{t('receivedHint')}</p>
        </section>
      )}
      {order.status === 'cancelled' && !order.cancellation && (
        <section className="notice">
          <p>{t('cancelledHint')}</p>
        </section>
      )}
      <CancellationSummary order={order} />
      {order.status === 'not_collected' && (
        <section className="notice">
          <h2>{lifecycleText('notCollected')}</h2>
          <p>{lifecycleText('notCollectedHint')}</p>
        </section>
      )}
      <div className="detail-row">
        <div>
          <p>{order.snapshot.venueName}</p>
          <p className="small">{order.snapshot.address}</p>
          <p className="small">
            {formatDate(order.snapshot.pickupStart)} ·{' '}
            {formatTime(order.snapshot.pickupStart)}–
            {formatTime(order.snapshot.pickupEnd)}
          </p>
        </div>
      </div>
      <div className="detail-row">
        <span>{t('quantity')}</span>
        <span>{order.quantity}</span>
      </div>
      <div className="detail-row">
        <span>
          {t(
            order.status === 'reserved' || order.status === 'confirmed'
              ? 'payAtPickup'
              : 'orderTotal',
          )}
        </span>
        <strong className="blue">{formatMoney(order.total)}</strong>
      </div>
      {order.status === 'confirmed' && (
        <section className="notice">
          <h2>{t('staffConfirms')}</h2>
          <p>{t('staffConfirmsHint')}</p>
        </section>
      )}
      <p className="small">{t('immutable')}</p>
      <p className="small">{text.guarantee}</p>
      <p className="small">
        {t('allergies')}: {text.allergens.join(' · ')}. {t('allergyHint')}
      </p>
      {(order.status === 'reserved' || order.status === 'confirmed') && (
        <p className="small">{t('cancelPolicy')}</p>
      )}
      <OrderTimeline order={order} />
      {(order.status === 'confirmed' ||
        order.status === 'collected' ||
        order.status === 'not_collected' ||
        (order.status === 'cancelled' &&
          order.events.some((event) => event.type === 'confirmed'))) && (
        <IssuePanel
          key={`buyer:${order.id}`}
          order={order}
          role="buyer"
          actorId={order.buyerId}
        />
      )}
      {failure !== null && (
        <section className="notice danger" role="alert">
          <p>{errorText(failure)}</p>
          {!needsVerification && <p>{t('confirmingHint')}</p>}
          <button className="button secondary" onClick={reload}>
            {t('checkStatus')}
          </button>
        </section>
      )}
      <button className="button secondary" onClick={reload} disabled={pending}>
        {t('refresh')}
      </button>
      {canCancel && !expired && (
        <button
          className="button danger"
          onClick={() => setAskCancel(true)}
          disabled={pending}
        >
          {t('cancel')}
        </button>
      )}
      {askCancel && (
        <CancelDialog busy={pending} close={() => setAskCancel(false)}>
          <h2 id="cancel-title">{t('cancelQuestion')}</h2>
          <p>{t('cancelHint')}</p>
          <button
            className="button danger"
            disabled={pending}
            onClick={() => act('cancel')}
          >
            {t('cancel')}
          </button>
          <button
            className="button secondary"
            disabled={pending}
            autoFocus
            onClick={() => setAskCancel(false)}
          >
            {t('keep')}
          </button>
        </CancelDialog>
      )}
    </BuyerShell>
  )
}

function CancelDialog({
  children,
  busy,
  close,
}: {
  children: ReactNode
  busy: boolean
  close: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      previous?.focus()
    }
  }, [])
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="cancel-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) close()
      }}
    >
      {children}
    </dialog>
  )
}
