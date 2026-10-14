'use client'

import type { VenueProfileResponse } from '@/shared/api'
import { useResource } from '@/shared/api'
import { useVenueI18n } from '@/entities/venue'
import { venueStyles as styles } from '@/shared/ui/venue-layout'
import { ProfileForm } from './ProfileForm'

export default function ProfileEditor({
  verified,
  onChanged,
}: {
  verified: boolean
  onChanged: () => void
}) {
  const { t, error } = useVenueI18n()
  const resource = useResource<VenueProfileResponse>('/api/merchant/profile')
  if (resource.loading) return <p role="status">{t('loading')}</p>
  if (!resource.data)
    return (
      <section className={styles.error} role="alert">
        <p>{error(resource.error)}</p>
        <button className={styles.secondary} onClick={resource.reload}>
          {t('retry')}
        </button>
      </section>
    )
  return (
    <ProfileForm
      key={resource.data.venue.id}
      initial={resource.data}
      verified={verified}
      onChanged={onChanged}
    />
  )
}
