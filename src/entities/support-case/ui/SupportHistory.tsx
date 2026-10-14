'use client'

import type { SupportCase, SupportResolution } from '@/shared/api'
import { useSupportI18n } from '../model/i18n'
import { supportStyles as styles } from '@/shared/ui/support-layout'

export function SupportDecision({
  resolution,
}: {
  resolution: SupportResolution
}) {
  const { t, locale, when } = useSupportI18n()
  return (
    <section className={styles.decision}>
      <h3>{t('decision')}</h3>
      <strong>{t('resolution.' + resolution.code)}</strong>
      <p className={styles.body}>{resolution.texts[locale]}</p>
      <p className={styles.hint}>
        {resolution.actorName} · {when(resolution.createdAt)}
      </p>
    </section>
  )
}

export default function SupportHistory({ support }: { support: SupportCase }) {
  const { t, when } = useSupportI18n()
  return (
    <section className={styles.panel}>
      <h3>{t('history')}</h3>
      <ol className={styles.history}>
        {support.history.map((event) => (
          <li key={event.id}>
            <strong>{t('action.' + event.action)}</strong>
            <div className={styles.meta}>
              <span>
                {t(event.actorRole)} · {event.actorName}
              </span>
              <time dateTime={event.createdAt}>{when(event.createdAt)}</time>
            </div>
            {event.fromStatus !== event.toStatus && (
              <p className={styles.hint}>
                {event.fromStatus && <>{t('status.' + event.fromStatus)} → </>}
                {t('status.' + event.toStatus)}
              </p>
            )}
            {event.assigneeName && (
              <p className={styles.hint}>
                {t('assigned')}: {event.assigneeName}
              </p>
            )}
            {event.reason === 'assignee_unavailable' && (
              <p className={styles.hint}>{t('reassigned')}</p>
            )}
            {event.note && <p className={styles.body}>{event.note}</p>}
            {event.resolution && (
              <SupportDecision resolution={event.resolution} />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
