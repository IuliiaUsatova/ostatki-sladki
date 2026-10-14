import { nearbySearchInput } from '../domain/nearby-validation.ts'
import { roundedDistanceKm } from '../domain/geography.ts'
import type { NearbySearchResponse, NearbyVenue } from '../domain/types.ts'
import type { Repository } from './repository.ts'
import { publicVenue } from './venue-profile.ts'

export const MAX_NEARBY_VENUES = 500

/** Filters and ranks before the response cap; request coordinates never enter durable storage. */
export function nearbySearch(
  repository: Repository,
  value: unknown,
  now: number,
): NearbySearchResponse {
  const input = nearbySearchInput(value),
    serverNow = new Date(now).toISOString()
  const location =
    "CASE WHEN json_type(p.content,'$.location')='object' THEN json_extract(p.content,'$.location') ELSE NULL END"
  const located = `nearby_distance(${location},0,0)`
  const distance = `nearby_distance(${location},:latitude,:longitude)`
  const stock =
    "o.total_quantity>COALESCE((SELECT SUM(quantity) FROM orders WHERE offer_id=o.id AND status IN ('reserved','confirmed','collected','not_collected')),0)"
  const eligible = `o.venue_id=v.id AND o.status='published' AND o.pickup_end>:now AND ${stock} AND (:kind='all' OR o.kind=:kind)`
  const nameMatch =
    "instr(support_fold(v.name||' '||v.address),support_fold(:search))>0"
  const titleMatch =
    '(' +
    (['ru', 'kk', 'en'] as const)
      .map(
        (locale) =>
          `instr(support_fold(json_extract(o.translations,'$.${locale}.title')),support_fold(:search))>0`,
      )
      .join(' OR ') +
    ')'
  const rows = repository.db
    .prepare(
      `SELECT v.id,${distance} AS distance,${located} IS NOT NULL AS located
    FROM venues v JOIN venue_moderation m ON m.venue_id=v.id LEFT JOIN venue_profiles p ON p.venue_id=v.id
    WHERE m.status='approved'
    AND (:kind='all' OR EXISTS(SELECT 1 FROM offers o WHERE ${eligible}))
    AND (:search='' OR ${nameMatch} OR EXISTS(SELECT 1 FROM offers o WHERE ${eligible} AND ${titleMatch}))
    AND (:radius IS NULL OR ${located} IS NULL OR ${distance}<=:radius)
    ORDER BY located DESC,ROUND(${distance},2) ASC,v.id ASC LIMIT :limit`,
    )
    .all({
      latitude: input.center?.latitude ?? null,
      longitude: input.center?.longitude ?? null,
      radius: input.radiusKm,
      kind: input.kind,
      search: input.search,
      now: serverNow,
      limit: MAX_NEARBY_VENUES + 1,
    }) as Array<{ id: string; distance: number | null; located: number }>
  const venues: NearbyVenue[] = [],
    unlocated: NearbyVenue[] = []
  const folded = input.search.toLocaleLowerCase('ru')
  for (const row of rows.slice(0, MAX_NEARBY_VENUES)) {
    const current = publicVenue(repository, row.id, serverNow)
    const named = (current.venue.name + ' ' + current.venue.address)
      .toLocaleLowerCase('ru')
      .includes(folded)
    const distanceKm =
      row.distance === null ? null : roundedDistanceKm(row.distance)
    const offers = current.offers
      .filter(
        (offer) =>
          offer.available > 0 &&
          (input.kind === 'all' || offer.kind === input.kind) &&
          (!input.search ||
            named ||
            Object.values(offer.translations).some((translation) =>
              translation.title.toLocaleLowerCase('ru').includes(folded),
            )),
      )
      .map((offer) => ({ ...offer, distanceKm }))
    const item: NearbyVenue = { venue: current.venue, offers, distanceKm }
    if (row.located) venues.push(item)
    else unlocated.push(item)
  }
  return {
    venues,
    unlocated,
    serverNow,
    truncated: rows.length > MAX_NEARBY_VENUES,
  }
}
