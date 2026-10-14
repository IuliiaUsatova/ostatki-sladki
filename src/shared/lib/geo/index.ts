import { invariant } from '../domain-error/index.ts'
import type { GeoPoint } from '../../api/index.transport.ts'
import { keys, object } from '../validation/index.ts'

export const MAX_MERCATOR_LATITUDE = 85.05112878
const EARTH_RADIUS_KM = 6371.0088

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const point = value as Record<string, unknown>
  return (
    Object.keys(point).length === 2 &&
    typeof point.latitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= MAX_MERCATOR_LATITUDE &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180
  )
}

export function geoPoint(value: unknown): GeoPoint {
  const point = object(value)
  keys(point, ['latitude', 'longitude'])
  invariant(
    isGeoPoint(point),
    'INVALID_INPUT',
    'Проверьте координаты на карте.',
  )
  return { latitude: point.latitude, longitude: point.longitude }
}

/** Shortest great-circle arc; the sine terms also cover crossing the international date line. */
export function greatCircleDistanceKm(from: GeoPoint, to: GeoPoint): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const latitudeDelta = radians(to.latitude - from.latitude)
  const longitudeDelta = radians(to.longitude - from.longitude)
  const arc =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2
  return (
    2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, arc))))
  )
}

export function roundedDistanceKm(distance: number): number {
  return Math.round(distance * 100) / 100
}
