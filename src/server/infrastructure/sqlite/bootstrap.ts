import type { DatabaseSync } from 'node:sqlite'
import {
  SEED_USERS,
  SEED_VENUES,
  SEED_VENUE_PROFILES,
  seedOffers,
} from '../../seed.ts'
import { inTransaction } from './connection.ts'

export function bootstrapDatabase(
  db: DatabaseSync,
  seedTime: number,
  seedFixtures: boolean,
): void {
  inTransaction(db, () => {
    db.exec(
      'INSERT OR IGNORE INTO auth_state (user_id) SELECT user_id FROM credentials',
    )
    if (seedFixtures) seedFixtureData(db, seedTime)
    db.prepare(
      `INSERT OR IGNORE INTO venue_moderation
        SELECT id,status,'','',1,?,?,NULL,NULL,NULL FROM venues`,
    ).run(new Date(seedTime).toISOString(), new Date(seedTime).toISOString())
  })
}

function seedFixtureData(db: DatabaseSync, seedTime: number): void {
  const insertVenue = db.prepare(
    'INSERT OR IGNORE INTO venues VALUES (?,?,?,?,?)',
  )
  for (const venue of SEED_VENUES)
    insertVenue.run(
      venue.id,
      venue.name,
      venue.address,
      venue.status,
      venue.timezone,
    )
  const insertUser = db.prepare('INSERT OR IGNORE INTO users VALUES (?,?,?,?)')
  for (const user of Object.values(SEED_USERS))
    insertUser.run(user.id, user.name, user.role, user.venueId)
  db.prepare('INSERT OR IGNORE INTO pickup_shifts VALUES (?,?,?,?)').run(
    'aliya',
    'goa-food',
    seedTime - 60 * 60_000,
    seedTime + 8 * 60 * 60_000,
  )
  const insertOffer = db.prepare(
    "INSERT OR IGNORE INTO offers VALUES (?,?,?,?,?,?,?,?,?,'published',?,?)",
  )
  for (const offer of seedOffers(seedTime))
    insertOffer.run(
      offer.id,
      offer.venueId,
      offer.kind,
      offer.price,
      offer.originalPrice,
      offer.totalQuantity,
      offer.image,
      offer.pickupStart,
      offer.pickupEnd,
      offer.distanceKm,
      JSON.stringify(offer.translations),
    )
  const insertProfile = db.prepare(
    'INSERT OR IGNORE INTO venue_profiles VALUES (?,?)',
  )
  for (const [id, profile] of Object.entries(SEED_VENUE_PROFILES))
    insertProfile.run(id, JSON.stringify(profile))
}
