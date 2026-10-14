import { randomUUID } from 'node:crypto'
import { invariant } from '../domain/errors.ts'
import { venueProfilePatch } from '../domain/venue-validation.ts'
import type {
  PublicVenueResponse,
  User,
  VenueApplication,
  VenueDetails,
  VenueProfileResponse,
} from '../domain/types.ts'
import type { Repository } from './repository.ts'
import { isGeoPoint } from '../domain/geography.ts'

export function applicationSnapshot(current: VenueApplication): VenueDetails {
  return {
    name: current.name,
    address: current.address,
    description: current.description,
    contactPhone: current.contactPhone,
    profile: current.profile ?? null,
  }
}

function owner(repository: Repository, actor: User): VenueApplication {
  const current = repository.user(actor.id)
  invariant(
    current?.role === 'cafe' && current.venueId,
    'FORBIDDEN',
    'У профиля нет доступа к заведению.',
    403,
  )
  const application = repository.application(current.venueId)
  invariant(
    application && application.owner.id === current.id,
    'FORBIDDEN',
    'Заявка недоступна.',
    403,
  )
  return application
}

export function merchantProfile(
  repository: Repository,
  actor: User,
  now: string,
): VenueProfileResponse {
  const application = owner(repository, actor)
  return {
    venue: repository.venue(application.id)!,
    profile: application.profile ?? null,
    photos: repository.photoAssets(application.id, actor.id),
    revision: application.revision,
    serverNow: now,
  }
}

export function ownedPhoto(
  repository: Repository,
  actor: User,
  id: string,
): void {
  const current = repository.user(actor.id)
  invariant(
    current?.role === 'cafe' && current.venueId,
    'FORBIDDEN',
    'У профиля нет доступа к заведению.',
    403,
  )
  invariant(
    repository.db
      .prepare(
        'SELECT id FROM photo_assets WHERE id=? AND venue_id=? AND owner_id=?',
      )
      .get(id, current.venueId, current.id),
    'PHOTO_NOT_FOUND',
    'Фотография недоступна вашему заведению.',
    404,
  )
}

export function updateMerchantProfile(
  repository: Repository,
  actor: User,
  value: unknown,
  now: string,
): VenueProfileResponse {
  const input = venueProfilePatch(value)
  return repository.transaction(() => {
    const current = owner(repository, actor)
    invariant(
      repository.user(actor.id)?.emailVerified === true,
      'EMAIL_NOT_VERIFIED',
      'Подтвердите email, чтобы продолжить.',
      403,
    )
    invariant(
      current.revision === input.expectedRevision,
      'MODERATION_CONFLICT',
      'Заявка уже изменена. Обновите данные перед решением.',
      409,
    )
    // Older profile editors omit this additive field; only an explicit null clears an existing pin.
    const profile =
      !Object.hasOwn(input.profile, 'location') &&
      current.profile &&
      Object.hasOwn(current.profile, 'location')
        ? { ...input.profile, location: current.profile.location }
        : input.profile
    for (const id of profile.photoIds) ownedPhoto(repository, actor, id)
    const revision = current.revision + 1
    repository.db
      .prepare(
        `INSERT INTO venue_profiles VALUES (?,?) ON CONFLICT(venue_id) DO UPDATE SET content=excluded.content`,
      )
      .run(current.id, JSON.stringify(profile))
    const changed = repository.db
      .prepare(
        `UPDATE venue_moderation SET status='pending',revision=?,submitted_at=?,updated_at=?,reasons=NULL,reviewed_at=NULL,reviewed_by=NULL
      WHERE venue_id=? AND revision=?`,
      )
      .run(revision, now, now, current.id, input.expectedRevision)
    invariant(
      Number(changed.changes) === 1,
      'MODERATION_CONFLICT',
      'Заявка уже изменена. Обновите данные перед решением.',
      409,
    )
    const snapshot = applicationSnapshot({ ...current, profile })
    repository.db
      .prepare(
        `INSERT INTO moderation_events VALUES (?,?,'submit',?,?,?,?,NULL,?)`,
      )
      .run(
        randomUUID(),
        current.id,
        now,
        actor.id,
        actor.name,
        revision,
        JSON.stringify(snapshot),
      )
    return merchantProfile(repository, actor, now)
  })
}

export function publicVenue(
  repository: Repository,
  id: string,
  now: string,
): PublicVenueResponse {
  const venue = repository.venue(id)
  invariant(
    venue?.status === 'approved',
    'VENUE_NOT_FOUND',
    'Заведение недоступно.',
    404,
  )
  const profile = repository.venueProfile(id)
  return {
    venue: {
      id: venue.id,
      name: venue.name,
      address: venue.address,
      timezone: venue.timezone,
      profile: profile
        ? {
            translations: profile.translations,
            openingHours: profile.openingHours,
          }
        : null,
      photos: repository.profilePhotos(id),
      location: isGeoPoint(profile?.location) ? { ...profile.location } : null,
    },
    offers: repository
      .offers(id)
      .filter(
        (offer) =>
          offer.status === 'published' &&
          Date.parse(offer.pickupEnd) > Date.parse(now),
      ),
    serverNow: now,
  }
}
