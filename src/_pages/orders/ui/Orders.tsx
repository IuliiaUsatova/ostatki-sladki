'use client'

import { useOfferText } from '@/entities/offer'

import Link from 'next/link'
import { useState } from 'react'
import type { Order, User } from '@/shared/api'
import { useResource } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { BuyerShell } from '@/shared/ui/app-shell'
import { BuyerLoginNotice, ErrorState, Loading } from '@/shared/ui/feedback'
import { useLifecycleI18n } from '@/entities/order'

export default function Orders() {
  const { t } = useI18n()
  const session = useResource<{ user: User | null }>('/api/session')
  return (
    <BuyerShell title={t('orders')}>
      {session.loading ? (
        <Loading />
      ) : session.error ? (
        <ErrorState error={session.error} retry={session.reload} />
      ) : session.data?.user?.role !== 'buyer' ? (
        <BuyerLoginNotice returnTo="/orders" />
      ) : (
        <OrderList />
      )}
    </BuyerShell>
  )
}
function OrderList() {
  const { t, formatMoney, formatDate, formatTime } = useI18n()
  const offerText = useOfferText()
  const { t: lifecycleText } = useLifecycleI18n()
  const { data, error, loading, reload } = useResource<{ orders: Order[] }>(
    '/api/orders',
  )
  const [tab, setTab] = useState('active')
  const active =
    data?.orders.filter((order) =>
      ['reserved', 'confirmed'].includes(order.status),
    ) ?? []
  const orders =
    tab === 'active'
      ? active
      : (data?.orders.filter(
          (order) => !['reserved', 'confirmed'].includes(order.status),
        ) ?? [])
  return (
    <>
      <div className="filter-tabs">
        {['active', 'history'].map((value) => (
          <button
            key={value}
            aria-pressed={tab === value}
            className={value === tab ? 'selected' : ''}
            onClick={() => setTab(value)}
          >
            {t(value)}
            {value === 'active' && ` · ${active.length}`}
          </button>
        ))}
        <button onClick={reload}>{t('refresh')}</button>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} retry={reload} />
      ) : orders.length === 0 ? (
        <section className="empty-state">
          <h2>{t('emptyOrders')}</h2>
          <p>{t('emptyOrdersHint')}</p>
          <Link className="button secondary" href="/">
            {t('browse')}
          </Link>
        </section>
      ) : (
        <div className="offer-list">
          {orders.map((order) => (
            <Link
              href={`/orders/${order.id}`}
              key={order.id}
              className="offer-card"
            >
              <img
                className="offer-photo"
                src={order.snapshot.image}
                width="96"
                height="108"
                alt=""
              />
              <div className="offer-copy">
                <h3>{offerText(order.snapshot).title}</h3>
                <p className="small">
                  {order.snapshot.venueName} · {order.number}
                </p>
                <strong className="offer-price">
                  {formatMoney(order.total)}
                </strong>
                <p className="small">
                  {formatDate(order.snapshot.pickupStart)} ·{' '}
                  {formatTime(order.snapshot.pickupStart)}–
                  {formatTime(order.snapshot.pickupEnd)}
                </p>
                <p className="small blue">
                  {order.status === 'not_collected'
                    ? lifecycleText('notCollected')
                    : t(order.status)}{' '}
                  · {order.quantity}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
