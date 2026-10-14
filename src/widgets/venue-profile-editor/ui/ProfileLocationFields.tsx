'use client'

import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import type { VenueProfileFormModel } from '../model/useVenueProfileForm'
import { MapCanvas } from '@/shared/ui/map'
export function ProfileLocationFields({
  current,
  location,
  pickLocation,
  disabled,
  latitudeInput,
  longitudeInput,
  locationFields,
  updateCoordinate,
  normalizeCoordinates,
  validation,
}: Pick<
  VenueProfileFormModel,
  | 'current'
  | 'location'
  | 'pickLocation'
  | 'disabled'
  | 'latitudeInput'
  | 'longitudeInput'
  | 'locationFields'
  | 'updateCoordinate'
  | 'normalizeCoordinates'
  | 'validation'
>) {
  const { t } = useVenueI18n()
  return (
    <section className={`${styles.panel} ${styles.section}`}>
      <div className={styles.sectionHeading}>
        <h2>{t('locationTitle')}</h2>
        <p>{t('locationHint')}</p>
      </div>
      <MapCanvas
        points={
          location
            ? [
                {
                  id: current.venue.id,
                  name: current.venue.name,
                  location,
                },
              ]
            : []
        }
        center={location}
        selectedId={location ? current.venue.id : null}
        onPick={pickLocation}
        disabled={disabled}
        height={290}
        ariaLabel={t('locationMap')}
      />
      <p className={styles.hint}>{t('locationManual')}</p>
      <fieldset className={styles.fieldset} disabled={disabled}>
        <div className={styles.coordinates}>
          <label className={styles.field}>
            {t('latitude')}
            <input
              ref={latitudeInput}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={locationFields.latitude}
              onChange={(event) =>
                updateCoordinate('latitude', event.target.value)
              }
              onBlur={normalizeCoordinates}
              aria-invalid={validation === 'invalidLocation'}
              aria-describedby="pickup-coordinate-hint"
            />
          </label>
          <label className={styles.field}>
            {t('longitude')}
            <input
              ref={longitudeInput}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={locationFields.longitude}
              onChange={(event) =>
                updateCoordinate('longitude', event.target.value)
              }
              onBlur={normalizeCoordinates}
              aria-invalid={validation === 'invalidLocation'}
              aria-describedby="pickup-coordinate-hint"
            />
          </label>
        </div>
        <p className={styles.hint} id="pickup-coordinate-hint">
          {t('coordinateHint')}
        </p>
        <div className={styles.locationActions}>
          <p className={styles.hint}>
            {t(location ? 'locationSelected' : 'locationNotSet')}
          </p>
          <button
            type="button"
            className={styles.secondary}
            disabled={
              disabled ||
              (!locationFields.latitude && !locationFields.longitude)
            }
            onClick={() => pickLocation(null)}
          >
            {t('locationRemove')}
          </button>
        </div>
      </fieldset>
    </section>
  )
}
