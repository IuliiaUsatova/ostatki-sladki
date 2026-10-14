'use client'

import type { GeoPoint } from '@/shared/api'
import { directionsUrl } from '@/shared/lib/directions'
import { useI18n } from '@/shared/i18n'
import { mapMessages } from './messages'

export default function DirectionsLink({
  venue,
  className,
}: {
  venue: { address: string; location: GeoPoint | null }
  className?: string
}) {
  const { locale } = useI18n()
  return (
    <a
      className={className ?? 'small blue'}
      href={directionsUrl(venue)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {mapMessages[locale].directions}
    </a>
  )
}
