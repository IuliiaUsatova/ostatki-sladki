'use client'
import type { ReactNode } from 'react'
import type { Locale, Offer, CreateOfferInput } from '@/shared/api'
import { useMerchantI18n, useVenueI18n } from '@/entities/venue'
import { merchantStyles as styles } from '@/shared/ui/merchant-layout'
import { useOfferEditor } from '../model/use-offer-editor'
import { languageNames } from '../model/draft'
export interface OfferPhotoPickerProps {
  value: string
  onChange: (url: string) => void
  disabled: boolean
}
export interface OfferEditorProps {
  offer: Offer | null
  userId: string
  serverNow: string
  approved: boolean
  verified: boolean
  onClose: () => void
  onSaved: (created: boolean) => void | Promise<void>
  renderPhotoPicker: (props: OfferPhotoPickerProps) => ReactNode
}
export default function OfferEditor(props: OfferEditorProps) {
  const { offer, approved, verified, onClose, renderPhotoPicker } = props
  const { t, error: errorText } = useMerchantI18n()
  const { t: venueText } = useVenueI18n()
  const {
    kind,
    setKind,
    textLocale,
    setTextLocale,
    translations,
    allergenText,
    setAllergenText,
    price,
    setPrice,
    original,
    setOriginal,
    quantity,
    setQuantity,
    status,
    setStatus,
    start,
    setStart,
    end,
    setEnd,
    image,
    setImage,
    busy,
    failure,
    formError,
    photoError,
    setPhotoError,
    uncertain,
    committed,
    ready,
    updateText,
    submit,
  } = useOfferEditor(props)
  return (
    <>
      <button className={styles.back} onClick={onClose}>
        {t('backOffers')}
      </button>
      <aside className={styles.notice}>
        <h2>{t('important')}</h2>
        <p>{t('snapshotNote')}</p>
      </aside>
      {uncertain && !failure && (
        <aside className={styles.notice}>
          <h2>{t('important')}</h2>
          <p>{t('unknownMutation')}</p>
        </aside>
      )}
      <form onSubmit={submit} className={styles.fields}>
        <div className={`${styles.panel} ${styles.editorGrid}`}>
          <fieldset
            className={styles.fields}
            disabled={
              busy || uncertain || committed || !approved || !verified || !ready
            }
            style={{ border: 0, margin: 0, padding: 0 }}
          >
            {!offer && (
              <>
                <label className={styles.field}>
                  {t('format')}
                  <select
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as CreateOfferInput['kind'])
                    }
                  >
                    <option value="surprise_bag">{t('surprise')}</option>
                    <option value="specific_item">{t('dish')}</option>
                  </select>
                </label>
                <div className={styles.filters}>
                  {(['ru', 'kk', 'en'] as Locale[]).map((language) => (
                    <button
                      key={language}
                      type="button"
                      className={styles.chip}
                      aria-pressed={textLocale === language}
                      onClick={() => setTextLocale(language)}
                    >
                      {languageNames[language]}
                    </button>
                  ))}
                </div>
                {(['title', 'description', 'guarantee'] as const).map(
                  (field) => (
                    <label key={field} className={styles.field}>
                      {t(field)} · {languageNames[textLocale]}
                      {field === 'title' ? (
                        <input
                          value={translations[textLocale][field]}
                          maxLength={100}
                          onChange={(event) =>
                            updateText(field, event.target.value)
                          }
                        />
                      ) : (
                        <textarea
                          value={translations[textLocale][field]}
                          maxLength={1000}
                          onChange={(event) =>
                            updateText(field, event.target.value)
                          }
                        />
                      )}
                    </label>
                  ),
                )}
                <label className={styles.field}>
                  {t('allergens')} · {languageNames[textLocale]}
                  <input
                    value={allergenText[textLocale]}
                    maxLength={250}
                    onChange={(event) =>
                      setAllergenText((current) => ({
                        ...current,
                        [textLocale]: event.target.value,
                      }))
                    }
                  />
                </label>
                <p className={styles.small}>{t('languageNote')}</p>
              </>
            )}
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                {t('price')}
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  step={1}
                  required
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </label>
              {!offer && (
                <label className={styles.field}>
                  {t('original')}
                  <input
                    type="number"
                    min={1}
                    max={1000000}
                    step={1}
                    required
                    value={original}
                    onChange={(event) => setOriginal(event.target.value)}
                  />
                </label>
              )}
            </div>
            <label className={styles.field}>
              {t('quantity')}
              <input
                type="number"
                min={offer ? 0 : 1}
                max={1000}
                step={1}
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                {t('start')}
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                {t('end')}
                <input
                  type="datetime-local"
                  required
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            </div>
            <p className={styles.small}>{t('timezone')}</p>
            {offer && (
              <label className={styles.field}>
                {t('status')}
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as Offer['status'])
                  }
                >
                  <option value="published">{t('published')}</option>
                  <option value="paused">{t('paused')}</option>
                </select>
              </label>
            )}
            {renderPhotoPicker({
              value: image,
              onChange: (url) => {
                setImage(url)
                setPhotoError(false)
              },
              disabled:
                busy ||
                uncertain ||
                committed ||
                !approved ||
                !verified ||
                !ready,
            })}
          </fieldset>
          <aside className={styles.context}>
            <h2>{t('checkBefore')}</h2>
            <p>{t(offer ? 'stockNote' : 'buyerSees')}</p>
            {offer && (
              <p>
                {t('remaining')}: {offer.available} · {t('committed')}:{' '}
                {offer.totalQuantity - offer.available}
              </p>
            )}
            {image && (
              <img
                src={image}
                alt=""
                width={356}
                height={190}
                className={styles.photo}
              />
            )}
          </aside>
        </div>
        {formError && (
          <div className={styles.error} role="alert">
            {t('requiredTranslations')}
          </div>
        )}
        {photoError && (
          <p className={styles.error} role="alert">
            {venueText('photoRequired')}
          </p>
        )}
        {failure !== null && (
          <div className={styles.error} role="alert">
            <p>{errorText(failure)}</p>
            {uncertain && <p>{t('unknownMutation')}</p>}
          </div>
        )}
        <div className={styles.actions}>
          <button
            className={styles.button}
            type="submit"
            disabled={busy || committed || !approved || !verified || !ready}
          >
            {t(
              busy
                ? 'saving'
                : uncertain
                  ? 'retrySame'
                  : offer
                    ? 'save'
                    : 'create',
            )}
          </button>
          <button type="button" className={styles.secondary} onClick={onClose}>
            {t('backOffers')}
          </button>
        </div>
      </form>
    </>
  )
}
