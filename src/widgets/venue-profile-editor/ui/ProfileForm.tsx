'use client'

import type { VenueProfileResponse } from '@/shared/api'
import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import { useVenueProfileForm } from '../model/useVenueProfileForm'
import { ProfileTextFields } from './ProfileTextFields'
import { ProfileLocationFields } from './ProfileLocationFields'
import { ProfileOpeningHours } from './ProfileOpeningHours'
import { ProfileGallery } from './ProfileGallery'
import { ProfileSubmission } from './ProfileSubmission'
import { ProfilePreview } from './ProfilePreview'

export function ProfileForm(props: {
  initial: VenueProfileResponse
  verified: boolean
  onChanged: () => void
}) {
  const { t, locale } = useVenueI18n()
  const { verified } = props
  const model = useVenueProfileForm({ ...props, locale })
  return (
    <>
      <p className={styles.intro}>{t('profileIntro')}</p>
      {model.success && (
        <p className={styles.success} role="status">
          {t(model.success)}
        </p>
      )}
      <div className={styles.editorGrid}>
        <form
          className={styles.form}
          onSubmit={model.submit}
          aria-busy={model.busy}
        >
          <ProfileTextFields
            textLocale={model.textLocale}
            setTextLocale={model.setTextLocale}
            disabled={model.disabled}
            draft={model.draft}
            updateText={model.updateText}
          />
          <ProfileLocationFields
            current={model.current}
            location={model.location}
            pickLocation={model.pickLocation}
            disabled={model.disabled}
            latitudeInput={model.latitudeInput}
            longitudeInput={model.longitudeInput}
            locationFields={model.locationFields}
            updateCoordinate={model.updateCoordinate}
            normalizeCoordinates={model.normalizeCoordinates}
            validation={model.validation}
          />
          <ProfileOpeningHours
            draft={model.draft}
            disabled={model.disabled}
            updateHours={model.updateHours}
          />
          <ProfileGallery
            selectedPhotos={model.selectedPhotos}
            disabled={model.disabled}
            movePhoto={model.movePhoto}
            selectPhoto={model.selectPhoto}
            setPhotos={model.setPhotos}
            photos={model.photos}
            draft={model.draft}
          />
          <ProfileSubmission
            verified={verified}
            checked={model.checked}
            setChecked={model.setChecked}
            disabled={model.disabled}
            validation={model.validation}
            failure={model.failure}
            needsReload={model.needsReload}
            busy={model.busy}
            reloadLatest={model.reloadLatest}
            changed={model.changed}
            replaceDraft={model.replaceDraft}
          />
        </form>
        <ProfilePreview
          selectedPhotos={model.selectedPhotos}
          current={model.current}
          draft={model.draft}
          textLocale={model.textLocale}
        />
      </div>
    </>
  )
}
