import type { DatabaseSync } from 'node:sqlite'
import type {
  Venue,
  VenueProfileContent,
  PhotoAsset,
  VenueApplication,
  ModerationEvent,
} from '../../../domain/types.ts'
type Row = Record<string, unknown>
import { SEED_VENUE_PHOTOS } from '../../seed.ts'
export function getVenue(db: DatabaseSync, id: string): Venue | null {
  const row = db
    .prepare(
      `SELECT v.*,m.status AS effective_status FROM venues v
      JOIN venue_moderation m ON m.venue_id=v.id WHERE v.id=?`,
    )
    .get(id) as Row | undefined
  return row
    ? {
        id: String(row.id),
        name: String(row.name),
        address: String(row.address),
        status: row.effective_status as Venue['status'],
        timezone: String(row.timezone),
      }
    : null
}

export function getVenueProfile(
  db: DatabaseSync,
  id: string,
): VenueProfileContent | null {
  const row = db
    .prepare('SELECT content FROM venue_profiles WHERE venue_id=?')
    .get(id) as Row | undefined
  return row ? (JSON.parse(String(row.content)) as VenueProfileContent) : null
}

export function getPhotoAsset(db: DatabaseSync, id: string): PhotoAsset | null {
  const row = db.prepare('SELECT * FROM photo_assets WHERE id=?').get(id) as
    | Row
    | undefined
  return row ? mapPhoto(row) : null
}

export function getPhotoAssets(
  db: DatabaseSync,
  venueId: string,
  ownerId: string,
): PhotoAsset[] {
  const rows = db
    .prepare(
      'SELECT * FROM photo_assets WHERE venue_id=? AND owner_id=? ORDER BY created_at DESC,rowid DESC',
    )
    .all(venueId, ownerId) as Row[]
  return rows.map((row) => mapPhoto(row))
}

export function getProfilePhotos(
  db: DatabaseSync,
  venueId: string,
  seedFixtures: boolean,
): PhotoAsset[] {
  const profile = getVenueProfile(db, venueId)
  if (!profile?.photoIds.length)
    return seedFixtures ? (SEED_VENUE_PHOTOS[venueId] ?? []) : []
  return profile.photoIds
    .map((id) => getPhotoAsset(db, id))
    .filter((photo): photo is PhotoAsset => photo !== null)
}

function mapPhoto(row: Row): PhotoAsset {
  return {
    id: String(row.id),
    url: `/api/photos/${row.id}`,
    width: Number(row.width),
    height: Number(row.height),
    bytes: Number(row.bytes),
    createdAt: String(row.created_at),
  }
}

export function getVenueApplication(
  db: DatabaseSync,
  id: string,
  seedFixtures: boolean,
): VenueApplication | null {
  const row = db
    .prepare(
      `SELECT v.id,v.name,v.address,v.timezone,m.*,
      u.id AS owner_id,u.name AS owner_name,c.email AS owner_email,r.name AS reviewer_name
      FROM venues v JOIN venue_moderation m ON m.venue_id=v.id
      JOIN users u ON u.venue_id=v.id AND u.role='cafe'
      LEFT JOIN credentials c ON c.user_id=u.id
      LEFT JOIN users r ON r.id=m.reviewed_by WHERE v.id=? ORDER BY u.rowid LIMIT 1`,
    )
    .get(id) as Row | undefined
  if (!row) return null
  const history = (
    db
      .prepare(
        'SELECT * FROM moderation_events WHERE venue_id=? ORDER BY revision',
      )
      .all(id) as Row[]
  ).map((event) => ({
    id: String(event.id),
    action: event.action as ModerationEvent['action'],
    at: String(event.at),
    actorName: String(event.actor_name),
    revision: Number(event.revision),
    reasons: event.reasons ? JSON.parse(String(event.reasons)) : null,
    snapshot: JSON.parse(String(event.snapshot)),
  }))
  return {
    id: String(row.id),
    name: String(row.name),
    address: String(row.address),
    description: String(row.description),
    contactPhone: String(row.contact_phone),
    profile: getVenueProfile(db, id),
    status: row.status as VenueApplication['status'],
    timezone: String(row.timezone),
    revision: Number(row.revision),
    submittedAt: String(row.submitted_at),
    updatedAt: String(row.updated_at),
    reasons: row.reasons ? JSON.parse(String(row.reasons)) : null,
    owner: {
      id: String(row.owner_id),
      name: String(row.owner_name),
      email: row.owner_email ? String(row.owner_email) : null,
    },
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: row.reviewer_name ? String(row.reviewer_name) : null,
    history,
    photos: getProfilePhotos(db, id, seedFixtures),
  }
}
