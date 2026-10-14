'use client'

import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import type { VenueProfileFormModel } from '../model/useVenueProfileForm'
import { languages, languageNames } from '../model/profile-fields'
export function ProfileTextFields({
  textLocale,
  setTextLocale,
  disabled,
  draft,
  updateText,
}: Pick<
  VenueProfileFormModel,
  'textLocale' | 'setTextLocale' | 'disabled' | 'draft' | 'updateText'
>) {
  const { t } = useVenueI18n()
  return (
    <section className={`${styles.panel} ${styles.section}`}>
      <div className={styles.sectionHeading}>
        <h2>{t('languages')}</h2>
        <p>{t('languageHint')}</p>
      </div>
      <div className={styles.tabs}>
        {languages.map((language) => (
          <button
            type="button"
            key={language}
            className={styles.tab}
            aria-pressed={textLocale === language}
            disabled={disabled}
            onClick={() => setTextLocale(language)}
          >
            {languageNames[language]}
          </button>
        ))}
      </div>
      <fieldset className={styles.fieldset} disabled={disabled}>
        <label className={styles.field}>
          {t('description')} · {languageNames[textLocale]}
          <textarea
            value={draft.translations[textLocale].description}
            onChange={(event) => updateText('description', event.target.value)}
            minLength={20}
            maxLength={1500}
            rows={6}
            required
          />
          <span className={styles.hint}>{t('descriptionHint')}</span>
        </label>
        <label className={styles.field}>
          {t('pickupInstructions')} · {languageNames[textLocale]}
          <textarea
            value={draft.translations[textLocale].pickupInstructions}
            onChange={(event) =>
              updateText('pickupInstructions', event.target.value)
            }
            minLength={5}
            maxLength={800}
            rows={4}
            required
          />
          <span className={styles.hint}>{t('pickupHint')}</span>
        </label>
      </fieldset>
    </section>
  )
}
