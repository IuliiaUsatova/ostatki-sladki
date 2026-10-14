import { randomUUID } from 'node:crypto'
import { invariant } from '../domain/errors.ts'
import { moderation, venueDetails } from '../domain/auth-validation.ts'
import { integer, keys, object } from '../domain/validation.ts'
import type {
  User,
  VenueApplication,
  VenueApplicationResponse,
  AdminVenuesResponse,
} from '../domain/types.ts'
import type { Repository } from './repository.ts'
import { applicationSnapshot } from './venue-profile.ts'

function application(repository: Repository, id: string): VenueApplication {
  const result = repository.application(id)
  invariant(result, 'VENUE_NOT_FOUND', 'Заявка не найдена.', 404)
  return result
}

function checkRevision(current: VenueApplication, expected: number) {
  invariant(
    current.revision === expected,
    'MODERATION_CONFLICT',
    'Заявка уже изменена. Обновите данные перед решением.',
    409,
  )
}

export function adminVenues(
  repository: Repository,
  now: string,
): AdminVenuesResponse {
  const ids = repository.db
    .prepare('SELECT venue_id FROM venue_moderation ORDER BY updated_at DESC')
    .all() as { venue_id: string }[]
  return {
    venues: ids.map((row) => application(repository, row.venue_id)),
    serverNow: now,
  }
}

export function getApplication(
  repository: Repository,
  id: string,
  now: string,
): VenueApplicationResponse {
  return { application: application(repository, id), serverNow: now }
}

export function moderateVenue(
  repository: Repository,
  actor: User,
  id: string,
  value: unknown,
  now: string,
): VenueApplicationResponse {
  const input = moderation(value)
  return repository.transaction(() => {
    const current = application(repository, id)
    checkRevision(current, input.expectedRevision)
    invariant(
      input.action === 'suspend'
        ? current.status === 'approved'
        : current.status === 'pending',
      'MODERATION_STATE_CONFLICT',
      'Это действие недоступно для текущего статуса заявки.',
      409,
    )
    const statuses = {
      approve: 'approved',
      reject: 'rejected',
      request_changes: 'changes_requested',
      suspend: 'suspended',
    } as const
    const revision = current.revision + 1
    repository.db
      .prepare(
        `UPDATE venue_moderation SET status=?,revision=?,updated_at=?,reasons=?,reviewed_at=?,reviewed_by=? WHERE venue_id=?`,
      )
      .run(
        statuses[input.action],
        revision,
        now,
        input.reasons ? JSON.stringify(input.reasons) : null,
        now,
        actor.id,
        id,
      )
    const snapshot = applicationSnapshot(current)
    repository.db
      .prepare('INSERT INTO moderation_events VALUES (?,?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        id,
        input.action,
        now,
        actor.id,
        actor.name,
        revision,
        input.reasons ? JSON.stringify(input.reasons) : null,
        JSON.stringify(snapshot),
      )
    return getApplication(repository, id, now)
  })
}

export function resubmitApplication(
  repository: Repository,
  actor: User,
  id: string,
  value: unknown,
  now: string,
): VenueApplicationResponse {
  const input = object(value)
  keys(input, [
    'expectedRevision',
    'name',
    'address',
    'description',
    'contactPhone',
  ])
  const expectedRevision = integer(
    input.expectedRevision,
    'версия заявки',
    1,
    Number.MAX_SAFE_INTEGER,
  )
  const validated = venueDetails({
    name: input.name,
    address: input.address,
    description: input.description,
    contactPhone: input.contactPhone,
  })
  return repository.transaction(() => {
    const current = application(repository, id)
    invariant(
      current.owner.id === actor.id,
      'FORBIDDEN',
      'Заявка недоступна.',
      403,
    )
    checkRevision(current, expectedRevision)
    const revision = current.revision + 1
    repository.db
      .prepare('UPDATE venues SET name=?,address=? WHERE id=?')
      .run(validated.name, validated.address, id)
    repository.db
      .prepare(
        `UPDATE venue_moderation SET status='pending',description=?,contact_phone=?,revision=?,submitted_at=?,updated_at=?,reasons=NULL,reviewed_at=NULL,reviewed_by=NULL WHERE venue_id=?`,
      )
      .run(
        validated.description,
        validated.contactPhone,
        revision,
        now,
        now,
        id,
      )
    repository.db
      .prepare(
        `INSERT INTO moderation_events VALUES (?,?,'submit',?,?,?,?,NULL,?)`,
      )
      .run(
        randomUUID(),
        id,
        now,
        actor.id,
        actor.name,
        revision,
        JSON.stringify({ ...validated, profile: current.profile ?? null }),
      )
    return getApplication(repository, id, now)
  })
}
