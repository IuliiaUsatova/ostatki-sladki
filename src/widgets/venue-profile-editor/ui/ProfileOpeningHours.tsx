'use client'

import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import type { VenueProfileFormModel } from '../model/useVenueProfileForm'

export function ProfileOpeningHours({
  draft,
  disabled,
  updateHours,
}: Pick<VenueProfileFormModel, 'draft' | 'disabled' | 'updateHours'>) {
  const { t } = useVenueI18n()
  return (
    <section className={`${styles.panel} ${styles.section}`}>
      <div className={styles.sectionHeading}>
        <h2>{t('openingHours')}</h2>
        <p>{t('hoursHint')}</p>
      </div>
      <fieldset className={styles.fieldset} disabled={disabled}>
        <div className={styles.hoursTable}>
          {draft.openingHours.map((row) => (
            <div key={row.day} className={styles.hoursRow}>
              <span>{t(`day${row.day}`)}</span>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={row.closed}
                  onChange={(event) =>
                    updateHours(
                      row.day,
                      event.target.checked
                        ? { closed: true, opens: '', closes: '' }
                        : { closed: false },
                    )
                  }
                />
                {t('closed')}
              </label>
              {!row.closed && (
                <>
                  <label>
                    <span>{t('opens')}</span>
                    <input
                      type="time"
                      value={row.opens}
                      required
                      aria-label={`${t(`day${row.day}`)} · ${t('opens')}`}
                      onChange={(event) =>
                        updateHours(row.day, {
                          opens: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('closes')}</span>
                    <input
                      type="time"
                      value={row.closes}
                      required
                      aria-label={`${t(`day${row.day}`)} · ${t('closes')}`}
                      onChange={(event) =>
                        updateHours(row.day, {
                          closes: event.target.value,
                        })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          ))}
        </div>
      </fieldset>
    </section>
  )
}
