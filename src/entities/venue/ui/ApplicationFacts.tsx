'use client'

import type { VenueApplication, VenueStatus } from '@/shared/api'
import { useAdminI18n } from '../model/moderation/i18n'
import { ApplicationSnapshot } from './VenueProfileReview'
import { adminStyles as styles } from '@/shared/ui/admin-layout'

export function ApplicationStatus({ status }: { status: VenueStatus }) {
  const { t } = useAdminI18n()
  return (
    <span className={styles.status} data-status={status}>
      {t(status)}
    </span>
  )
}

export function ApplicationHistory({
  application,
}: {
  application: VenueApplication
}) {
  const { t, locale, when } = useAdminI18n()
  return (
    <section className={styles.history}>
      <h3>{t('history')}</h3>
      {application.history.length ? (
        <ol>
          {application.history.map((event) => (
            <li key={event.id}>
              <span className={styles.historyPoint} aria-hidden="true" />
              <div>
                <strong>{t(`action.${event.action}`)}</strong>
                <p className={styles.muted}>
                  {event.actorName} · {when(event.at)} · {t('revision')}{' '}
                  {event.revision}
                </p>
                {event.reasons && (
                  <p className={styles.historyReason}>
                    {event.reasons[locale]}
                  </p>
                )}
                <ApplicationSnapshot snapshot={event.snapshot} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.muted}>{t('noHistory')}</p>
      )}
    </section>
  )
}
