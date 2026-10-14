import { isGeoPoint } from '../geo/index.ts'
import type { GeoPoint } from '@/shared/api'

export type LocationFailure =
  | 'locationDenied'
  | 'locationTimeout'
  | 'locationUnavailable'

export function searchPoint(point: GeoPoint): GeoPoint | null {
  if (!isGeoPoint(point)) return null
  return {
    latitude: Math.round(point.latitude * 10_000) / 10_000,
    longitude: Math.round(point.longitude * 10_000) / 10_000,
  }
}

// A one-shot browser request cannot be aborted, so ignore callbacks after cancellation.
export function requestSearchLocation(
  provider: Pick<Geolocation, 'getCurrentPosition'> | undefined,
  success: (point: GeoPoint) => void,
  failure: (key: LocationFailure) => void,
): () => void {
  let active = true
  const fail = (key: LocationFailure) => {
    if (!active) return
    active = false
    failure(key)
  }
  if (!provider) fail('locationUnavailable')
  else {
    try {
      provider.getCurrentPosition(
        (position) => {
          if (!active) return
          const point = searchPoint({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
          if (!point) fail('locationUnavailable')
          else {
            active = false
            success(point)
          }
        },
        (error) =>
          fail(
            error.code === 1
              ? 'locationDenied'
              : error.code === 3
                ? 'locationTimeout'
                : 'locationUnavailable',
          ),
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 120_000 },
      )
    } catch {
      fail('locationUnavailable')
    }
  }
  return () => {
    active = false
  }
}
