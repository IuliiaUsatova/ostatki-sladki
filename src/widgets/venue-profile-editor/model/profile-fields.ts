import type { GeoPoint, Locale, VenueProfileContent } from '@/shared/api'

export const languageNames: Record<Locale, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}
export const languages: Locale[] = ['ru', 'kk', 'en']
export const latitudeLimit = 85.05112878
export type CoordinateFields = { latitude: string; longitude: string }
export function coordinateFields(point?: GeoPoint | null): CoordinateFields {
  if (!point) return { latitude: '', longitude: '' }
  const latitude = point.latitude.toFixed(5)
  return {
    // Rounding a valid Mercator edge to five places must not put it outside the range.
    latitude:
      Math.abs(Number(latitude)) > latitudeLimit
        ? String(point.latitude)
        : latitude,
    longitude: point.longitude.toFixed(5),
  }
}
export function coordinateValue(
  value: string,
  limit: number,
): number | undefined {
  const text = value.trim()
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return undefined
  const number = Number(text.replace(',', '.'))
  return Number.isFinite(number) && Math.abs(number) <= limit
    ? number
    : undefined
}
export function readLocation(
  fields: CoordinateFields,
): GeoPoint | null | undefined {
  if (!fields.latitude.trim() && !fields.longitude.trim()) return null
  const latitude = coordinateValue(fields.latitude, latitudeLimit)
  const longitude = coordinateValue(fields.longitude, 180)
  return latitude !== undefined && longitude !== undefined
    ? { latitude, longitude }
    : undefined
}
export function blankProfile(): VenueProfileContent {
  return {
    translations: {
      ru: { description: '', pickupInstructions: '' },
      kk: { description: '', pickupInstructions: '' },
      en: { description: '', pickupInstructions: '' },
    },
    openingHours: Array.from({ length: 7 }, (_, day) => ({
      day,
      closed: true,
      opens: '',
      closes: '',
    })),
    photoIds: [],
    location: null,
  }
}
