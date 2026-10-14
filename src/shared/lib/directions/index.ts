import type { GeoPoint } from '../../api/index.transport.ts'

export function directionsUrl(venue: {
  address: string
  location: GeoPoint | null
}): string {
  const destination = venue.location
    ? `${venue.location.latitude},${venue.location.longitude}`
    : venue.address
  const params = new URLSearchParams({
    api: '1',
    destination,
    travelmode: 'walking',
  })
  return `https://www.google.com/maps/dir/?${params}`
}
