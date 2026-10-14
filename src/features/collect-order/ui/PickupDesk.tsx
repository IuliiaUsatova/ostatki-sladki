'use client'
import { useMerchantI18n } from '@/entities/venue'
import { useOfferText } from '@/entities/offer'
import { merchantStyles as styles } from '@/shared/ui/merchant-layout'
import { usePickupDesk } from '../model/use-pickup-desk'
export interface PickupDeskProps {
  actorId: string
  onCollected: () => void | Promise<void>
}
export default function PickupDesk({ actorId, onCollected }: PickupDeskProps) {
  const { t, time, date, money, error: errorText } = useMerchantI18n()
  const offerText = useOfferText()
  const {
    code,
    setCode,
    order,
    physical,
    setPhysical,
    busy,
    failure,
    uncertain,
    ready,
    lookup,
    confirm,
  } = usePickupDesk(actorId, onCollected)
  return (
    <>
      <aside className={styles.notice}>
        <h2>{t('important')}</h2>
        <p>{t('lookupHelp')}</p>
      </aside>
      <form className={styles.codeForm} onSubmit={lookup}>
        <label className={styles.field}>
          {t('code')}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            autoComplete="off"
            value={code}
            disabled={busy || uncertain || !ready}
            onChange={(event) => {
              setCode(event.target.value)
            }}
          />
        </label>
        <button
          className={styles.button}
          disabled={busy || uncertain || !ready}
        >
          {t(busy ? 'checking' : 'lookup')}
        </button>
      </form>
      {failure !== null && (
        <div className={styles.error} role="alert">
          <p>{errorText(failure)}</p>
          {uncertain && <p>{t('unknownMutation')}</p>}
        </div>
      )}
      {uncertain && (
        <aside className={styles.notice} role="status">
          <p>{t('unknownMutation')}</p>
          <p>
            {t('code')}: {code}
          </p>
          <button
            type="button"
            className={styles.button}
            disabled={busy || !ready}
            onClick={() => void confirm()}
          >
            {t(busy ? 'processing' : 'retrySame')}
          </button>
        </aside>
      )}
      {order && (
        <section className={`${styles.panel} ${styles.pickupCard}`}>
          <div>
            <h2>
              {order.number} · {order.buyerName}
            </h2>
            <span
              className={styles.status}
              data-tone={order.status === 'collected' ? 'success' : 'info'}
            >
              {t(`status.${order.status}`)}
            </span>
          </div>
          <dl className={styles.detailList}>
            <div>
              <dt>{t('contents')}</dt>
              <dd>
                {offerText(order.snapshot).title} × {order.quantity}
              </dd>
            </div>
            <div>
              <dt>{t('total')}</dt>
              <dd>{money(order.total)}</dd>
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
              <dt>{t('allergies')}</dt>
              <dd>
                {offerText(order.snapshot).allergens.join(', ') ||
                  t('noneKnown')}
              </dd>
            </div>
          </dl>
          <p>{offerText(order.snapshot).guarantee}</p>
          {order.status === 'collected' ? (
            <div className={styles.success} role="status">
              <h3>{t('handoffDone')}</h3>
              <p>{t('doneNote')}</p>
            </div>
          ) : order.status === 'confirmed' ? (
            <>
              <aside className={styles.notice}>
                <p>{t('confirmOnly')}</p>
              </aside>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={physical}
                  disabled={busy || uncertain || !ready}
                  onChange={(event) => setPhysical(event.target.checked)}
                />
                {t('handedPhysical')}
              </label>
              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={busy || uncertain || !physical || !ready}
                  onClick={() => void confirm()}
                >
                  {t(busy ? 'processing' : uncertain ? 'retrySame' : 'handoff')}
                </button>
              </div>
            </>
          ) : (
            <aside className={styles.notice}>
              <p>{t('notReady')}</p>
            </aside>
          )}
        </section>
      )}
    </>
  )
}
