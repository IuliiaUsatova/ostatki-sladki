'use client'
import type {
  MerchantResponse,
  Order,
  OrderIssueSummary,
  User,
} from '@/shared/api'
import { useMerchantI18n } from '@/entities/venue'
import { merchantStyles as styles } from '@/shared/ui/merchant-layout'
import type { Filter } from '../model/types'
import { OrdersTable } from './MerchantTables'
import { Notice } from './MerchantPrimitives'
export default function MerchantOrdersOverview({
  data,
  role,
  filter,
  onFilter,
  showSummary,
  onOpen,
  onPickup,
  onNewOffer,
}: {
  data: MerchantResponse
  role: User['role']
  filter: Filter
  onFilter: (filter: Filter) => void
  showSummary: boolean
  onOpen: (order: Order) => void
  onPickup: () => void
  onNewOffer: () => void
}) {
  const { t, money } = useMerchantI18n()
  const approved = data.venue.status === 'approved'
  const confirmed = data.orders.filter((order) => order.status === 'confirmed')
  const confirmedUnits = confirmed.reduce(
    (sum, order) => sum + order.quantity,
    0,
  )
  const available = !approved
    ? 0
    : data.offers
        .filter(
          (offer) =>
            offer.status === 'published' &&
            Date.parse(offer.pickupEnd) > Date.parse(data.serverNow),
        )
        .reduce((sum, offer) => sum + offer.available, 0)
  const bookedValue = confirmed.reduce((sum, order) => sum + order.total, 0)
  const issueByOrder = new Map<string, OrderIssueSummary>(
    role === 'cafe'
      ? (data.orderIssues ?? []).map((issue) => [issue.orderId, issue])
      : [],
  )
  const needsReply = new Set(
    [...issueByOrder.values()]
      .filter((issue) => issue.status === 'open')
      .map((issue) => issue.orderId),
  )
  const displayedOrders = data.orders.filter((order) =>
    filter === 'needs_reply'
      ? needsReply.has(order.id)
      : filter === 'all' || order.status === filter,
  )
  return (
    <>
      <div className={styles.filters}>
        {(
          [
            ...(role === 'cafe' ? ['needs_reply'] : []),
            'all',
            'confirmed',
            'collected',
            'cancelled',
            'not_collected',
            'reserved',
          ] as Filter[]
        ).map((item) => (
          <button
            key={item}
            className={styles.chip}
            aria-pressed={filter === item}
            onClick={() => onFilter(item)}
          >
            {t(item === 'confirmed' ? 'waiting' : item)}
            {item === 'needs_reply' && ` · ${needsReply.size}`}
          </button>
        ))}
      </div>
      {showSummary && (
        <>
          <div className={styles.summary}>
            <Metric
              title={t('toHandoff')}
              value={String(confirmedUnits)}
              note={`${confirmed.length} ${t('confirmedOrders')}`}
            />
            <Metric
              title={t('available')}
              value={`${available} ${t('units')}`}
              note={t('activeOffers')}
            />
            <Metric
              title={t('bookings')}
              value={money(bookedValue)}
              note={t('beforeRefunds')}
            />
          </div>
          <Notice title={t('important')}>{t('prepare')}</Notice>
        </>
      )}
      <section>
        <h2>{t('orders')}</h2>
        <OrdersTable
          orders={displayedOrders}
          issues={issueByOrder}
          onOpen={onOpen}
          empty={t(data.orders.length ? 'noFilteredOrders' : 'noOrders')}
        />
      </section>
      <div className={styles.actions}>
        <button className={styles.secondary} onClick={onPickup}>
          {t('checkCode')}
        </button>
        {approved && (
          <button className={styles.secondary} onClick={onNewOffer}>
            {t('addOffer')}
          </button>
        )}
      </div>
    </>
  )
}

function Metric({
  title,
  value,
  note,
}: {
  title: string
  value: string
  note: string
}) {
  return (
    <div className={styles.metric}>
      <p className={styles.small}>{title}</p>
      <p className={styles.metricValue}>{value}</p>
      <p className={styles.small}>{note}</p>
    </div>
  )
}
