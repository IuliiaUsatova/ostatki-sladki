'use client'

import { useState } from 'react'
import type { Offer, Order, OrderIssueSummary } from '@/shared/api'
import { useMerchantI18n } from '@/entities/venue'
import { useOfferText } from '@/entities/offer'
import { merchantStyles as styles } from '@/shared/ui/merchant-layout'
import { Status, Notice } from './MerchantPrimitives'

export function OrdersTable({
  orders,
  issues,
  onOpen,
  empty,
}: {
  orders: Order[]
  issues: ReadonlyMap<string, OrderIssueSummary>
  onOpen: (order: Order) => void
  empty: string
}) {
  const { t, time, money } = useMerchantI18n()
  const offerText = useOfferText()
  if (!orders.length)
    return <div className={`${styles.panel} ${styles.empty}`}>{empty}</div>
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {[
              'number',
              'buyer',
              'contents',
              'booked',
              'pickupWindow',
              'status',
              'total',
            ].map((key) => (
              <th scope="col" key={key}>
                {t(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>
                <button
                  className={styles.textButton}
                  onClick={() => onOpen(order)}
                >
                  {order.number}
                </button>
                {issues.has(order.id) && (
                  <button
                    type="button"
                    className={styles.issueBadge}
                    data-status={issues.get(order.id)!.status}
                    aria-label={`${t(`issue.${issues.get(order.id)!.status}`)} · ${t('number')} ${order.number}`}
                    onClick={() => onOpen(order)}
                  >
                    {t(`issue.${issues.get(order.id)!.status}`)}
                  </button>
                )}
              </td>
              <td>{order.buyerName}</td>
              <td>
                {offerText(order.snapshot).title} × {order.quantity}
              </td>
              <td>{time(order.createdAt)}</td>
              <td>
                {time(order.snapshot.pickupStart)}–
                {time(order.snapshot.pickupEnd)}
              </td>
              <td>
                <Status order={order} />
              </td>
              <td>{money(order.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OffersTable({
  offers,
  onEdit,
}: {
  offers: Offer[]
  onEdit: (offer: Offer) => void
}) {
  const { t, time, money } = useMerchantI18n()
  const offerText = useOfferText()
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const visible = offers.filter(
    (offer) =>
      (status === 'all' || offer.status === status) &&
      offerText(offer)
        .title.toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  )
  return (
    <>
      <div className={styles.filters}>
        {['all', 'published', 'paused'].map((item) => (
          <button
            key={item}
            className={styles.chip}
            aria-pressed={status === item}
            onClick={() => setStatus(item)}
          >
            {t(item === 'all' ? 'allOffers' : item)} ·{' '}
            {
              offers.filter((offer) => item === 'all' || offer.status === item)
                .length
            }
          </button>
        ))}
      </div>
      <Notice title={t('important')}>{t('pauseNote')}</Notice>
      <input
        className={styles.search}
        type="search"
        aria-label={t('search')}
        placeholder={t('search')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <section>
        <h2>{t('offers')}</h2>
        {!visible.length ? (
          <div className={`${styles.panel} ${styles.empty}`}>
            {t('noOffers')}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {[
                    'title',
                    'format',
                    'priceNormal',
                    'capacity',
                    'committed',
                    'remaining',
                    'pickupWindow',
                    'status',
                  ].map((key) => (
                    <th scope="col" key={key}>
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((offer) => (
                  <tr key={offer.id}>
                    <td>
                      <button
                        className={styles.textButton}
                        onClick={() => onEdit(offer)}
                      >
                        {offerText(offer).title}
                      </button>
                    </td>
                    <td>
                      {t(offer.kind === 'surprise_bag' ? 'surprise' : 'dish')}
                    </td>
                    <td>
                      {money(offer.price)} / {money(offer.originalPrice)}
                    </td>
                    <td>{offer.totalQuantity}</td>
                    <td>{offer.totalQuantity - offer.available}</td>
                    <td>{offer.available}</td>
                    <td>
                      {time(offer.pickupStart)}–{time(offer.pickupEnd)}
                    </td>
                    <td>
                      <span
                        className={styles.status}
                        data-tone={offer.status === 'paused' ? 'muted' : 'info'}
                      >
                        {t(offer.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
