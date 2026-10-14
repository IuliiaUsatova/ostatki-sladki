'use client'

import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import type { VenueProfileFormModel } from '../model/useVenueProfileForm'
import Link from 'next/link'
export function ProfileSubmission({
  checked,
  setChecked,
  disabled,
  validation,
  failure,
  needsReload,
  busy,
  reloadLatest,
  changed,
  replaceDraft,
  verified,
}: Pick<
  VenueProfileFormModel,
  | 'checked'
  | 'setChecked'
  | 'disabled'
  | 'validation'
  | 'failure'
  | 'needsReload'
  | 'busy'
  | 'reloadLatest'
  | 'changed'
  | 'replaceDraft'
> & { verified: boolean }) {
  const { t, error } = useVenueI18n()
  return (
    <>
      <section className={styles.notice}>
        <h3>{t('reviewTitle')}</h3>
        <p>{t('reviewHint')}</p>
      </section>

      <label className={styles.check}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => setChecked(event.target.checked)}
        />
        {t('acknowledge')}
      </label>

      {!verified && (
        <Link className={styles.secondary} href="/verify-email">
          {t('verifyEmail')}
        </Link>
      )}

      {validation && (
        <p className={styles.error} role="alert">
          {t(validation)}
        </p>
      )}

      {failure !== null && (
        <p className={styles.error} role="alert">
          {error(failure)}
        </p>
      )}

      <div className={styles.actions}>
        {needsReload ? (
          <button
            className={styles.primary}
            type="button"
            disabled={busy}
            onClick={reloadLatest}
          >
            {t('reloadLatest')}
          </button>
        ) : (
          <button
            className={styles.primary}
            type="submit"
            disabled={disabled || !checked || !changed}
          >
            {t(busy ? 'saving' : 'submit')}
          </button>
        )}
        {!needsReload && (
          <button
            className={styles.secondary}
            type="button"
            disabled={busy}
            onClick={reloadLatest}
          >
            {t('reloadLatest')}
          </button>
        )}
        <button
          className={styles.secondary}
          type="button"
          disabled={busy || needsReload}
          onClick={replaceDraft}
        >
          {t('useSaved')}
        </button>
      </div>
    </>
  )
}
