'use client'

import type { Order, User } from '@/shared/api'
import { useMerchantI18n } from '@/entities/venue'
import { useOfferText } from '@/entities/offer'
import { merchantStyles as styles } from '@/shared/ui/merchant-layout'
import { OrderDiscussion } from '@/widgets/order-discussion'
import { CafeCancellation } from '@/features/cancel-cafe-order'
import {
  CancellationSummary,
  OrderTimeline,
  useLifecycleI18n,
} from '@/entities/order'
import { Status, Notice } from './MerchantPrimitives'

export default function MerchantOrderDetail({
  order,
  user,
  onChanged,
  onBack,
  onPickup,
}: {
  order: Order
  user: User
  onChanged: () => void
  onBack: () => void
  onPickup: () => void
}) {
  const { t, money, time, date } = useMerchantI18n()
  const { t: lifecycleText } = useLifecycleI18n()
  const offerText = useOfferText()
  const text = offerText(order.snapshot)
  return (
    <>
      <button className={styles.back} onClick={onBack}>
        {t('backOrders')}
      </button>
      <div className={`${styles.panel} ${styles.editorGrid}`}>
        <dl className={styles.detailList}>
          <div>
            <dt>{t('buyer')}</dt>
            <dd>{order.buyerName}</dd>
          </div>
          <div>
            <dt>{t('status')}</dt>
            <dd>
              <Status order={order} />
            </dd>
          </div>
          <div>
            <dt>{t('pickupWindow')}</dt>
            <dd>
              {date(order.snapshot.pickupStart)} ·{' '}
              {time(order.snapshot.pickupStart)}–
              {time(order.snapshot.pickupEnd)}
            </dd>
          </div>
          <div>
            <dt>{t('venue')}</dt>
            <dd>
              {order.snapshot.venueName} · {order.snapshot.address}
            </dd>
          </div>
          <div>
            <dt>{t('total')}</dt>
            <dd>{money(order.total)}</dd>
          </div>
          <div>
            <dt>{t('contents')}</dt>
            <dd>
              {text.title} × {order.quantity}
            </dd>
          </div>
        </dl>
        {order.status === 'confirmed' && (
          <aside className={styles.context}>
            <h2>{t('important')}</h2>
            <p>{t('confirmOnly')}</p>
          </aside>
        )}
      </div>
      <section>
        <h2>{t('savedTerms')}</h2>
        <div className={styles.panel}>
          <p>{text.guarantee}</p>
          <p className={styles.small}>
            {t('allergies')}:{' '}
            {text.allergens.length ? text.allergens.join(', ') : t('noneKnown')}
          </p>
        </div>
      </section>
      <section>
        <CancellationSummary order={order} />
        <OrderTimeline order={order} />
      </section>
      {order.status === 'not_collected' && (
        <Notice title={lifecycleText('notCollected')}>
          {lifecycleText('notCollectedHint')}
        </Notice>
      )}
      {user.role === 'cafe' && (
        <>
          <CafeCancellation
            key={`cancel:${user.id}:${order.id}`}
            order={order}
            actorId={user.id}
            onChanged={onChanged}
          />
          <OrderDiscussion
            key={`issue:${user.id}:${order.id}`}
            order={order}
            role="cafe"
            actorId={user.id}
            onChanged={onChanged}
          />
        </>
      )}
      {order.status === 'confirmed' && (
        <button className={styles.secondary} onClick={onPickup}>
          {t('openPickup')}
        </button>
      )}
    </>
  )
}
