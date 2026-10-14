import type { DatabaseSync } from 'node:sqlite'
import type { Offer, Locale, OfferTranslation } from '../../../domain/types.ts'
type Row = Record<string, unknown>
export function getOffer(db: DatabaseSync, id: string): Offer | null {
  const row = db
    .prepare(
      `
      SELECT o.*,v.name AS venue_name,v.address,
        o.total_quantity - COALESCE((SELECT SUM(quantity) FROM orders WHERE offer_id=o.id AND status IN ('reserved','confirmed','collected','not_collected')),0) AS available
      FROM offers o JOIN venues v ON v.id=o.venue_id WHERE o.id=?
    `,
    )
    .get(id) as Row | undefined
  return row ? mapOffer(row) : null
}

export function listOffers(db: DatabaseSync, venueId?: string): Offer[] {
  const rows = db
    .prepare(
      `
      SELECT o.*,v.name AS venue_name,v.address,
        o.total_quantity - COALESCE((SELECT SUM(quantity) FROM orders WHERE offer_id=o.id AND status IN ('reserved','confirmed','collected','not_collected')),0) AS available
      FROM offers o JOIN venues v ON v.id=o.venue_id ${venueId ? 'WHERE o.venue_id=?' : ''} ORDER BY o.rowid
    `,
    )
    .all(...(venueId ? [venueId] : [])) as Row[]
  return rows.map((row) => mapOffer(row))
}

function mapOffer(row: Row): Offer {
  const translations = JSON.parse(String(row.translations)) as Record<
    Locale,
    OfferTranslation
  >
  return {
    id: String(row.id),
    title: translations.ru.title,
    kind: row.kind as Offer['kind'],
    venueId: String(row.venue_id),
    venueName: String(row.venue_name),
    address: String(row.address),
    description: translations.ru.description,
    guarantee: translations.ru.guarantee,
    allergens: translations.ru.allergens,
    price: Number(row.price),
    originalPrice: Number(row.original_price),
    available: Number(row.available),
    totalQuantity: Number(row.total_quantity),
    image: String(row.image),
    pickupStart: String(row.pickup_start),
    pickupEnd: String(row.pickup_end),
    status: row.status as Offer['status'],
    distanceKm: null,
    translations,
  }
}
