'use client'

import type { Order } from '@/shared/api'
import { useLifecycleI18n } from '../model/i18n'
import { lifecycleStyles as styles } from '@/shared/ui/order-layout'

export function CancellationSummary({
  order,
}: {
  order: Pick<Order, 'status' | 'cancellation'>
}) {
  const { t, when } = useLifecycleI18n()
  if (order.status !== 'cancelled' || !order.cancellation) return null
  const cancellation = order.cancellation
  return (
    <section className={styles.cancellation}>
      <h2>
        {t(
          cancellation.source === 'cafe'
            ? 'cancelledByCafe'
            : 'cancelledByBuyer',
        )}
      </h2>
      {cancellation.reason && <p>{t(`reason.${cancellation.reason}`)}</p>}
      {cancellation.note && (
        <>
          <strong>{t('cancellationNote')}</strong>
          <p className={styles.note}>{cancellation.note}</p>
        </>
      )}
      <p className={styles.hint}>{when(cancellation.at)}</p>
    </section>
  )
}

export function OrderTimeline({
  order,
}: {
  order: Pick<Order, 'events' | 'cancellation'>
}) {
  const { t, when } = useLifecycleI18n()
  return (
    <section className={styles.panel}>
      <h2>{t('history')}</h2>
      <ol className={styles.history}>
        {order.events.map((event) => (
          <li key={event.id}>
            <strong>
              {t(
                event.type === 'cancelled' &&
                  order.cancellation?.source === 'cafe'
                  ? 'event.cancelled_cafe'
                  : `event.${event.type}`,
              )}
            </strong>
            <p>
              {event.type === 'expired' || event.type === 'not_collected'
                ? t('system')
                : event.actorName}{' '}
              · {when(event.at)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}
