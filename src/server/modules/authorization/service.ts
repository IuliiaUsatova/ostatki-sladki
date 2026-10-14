import { invariant } from '../../../domain/errors.ts'
import type { User, Venue } from '../../../domain/types.ts'
import type { Repository } from '../../repository.ts'
export interface Authorization {
  actor(user: User | null, roles: User['role'][]): User
  venue(user: User, requireApproval?: boolean): Venue
  verified(user: User): void
  staff(user: User | null): User
}
type Dependencies = {
  repository: Pick<Repository, 'user' | 'venue'>
  clock: () => number
  allowPersonaSessions: () => boolean
  hasActiveShift: (
    userId: string,
    venueId: string,
    startsBy: number,
    endsAfter: number,
  ) => boolean
}
export class MarketplaceAuthorization {
  private readonly dependencies: Dependencies

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies
  }

  actor(user: User | null, roles: User['role'][]): User {
    const { repository } = this.dependencies

    invariant(
      user,
      'AUTH_REQUIRED',
      'Войдите в аккаунт, чтобы продолжить.',
      401,
    )
    const current = repository.user(user.id)
    invariant(
      current,
      'AUTH_REQUIRED',
      'Войдите в аккаунт, чтобы продолжить.',
      401,
    )
    invariant(
      roles.includes(current.role),
      'FORBIDDEN',
      'Эта операция недоступна вашей роли.',
      403,
    )
    return current
  }

  venue(user: User, requireApproval = false): Venue {
    const { repository } = this.dependencies

    const venue = user.venueId ? repository.venue(user.venueId) : null
    invariant(venue, 'FORBIDDEN', 'У профиля нет доступа к заведению.', 403)
    if (requireApproval)
      invariant(
        venue.status === 'approved',
        'VENUE_PENDING',
        'Заведение пока проходит проверку. Публикация недоступна.',
        403,
      )
    return venue
  }

  verified(user: User): void {
    const { repository, allowPersonaSessions } = this.dependencies

    const current = repository.user(user.id)
    invariant(
      current?.emailVerified === true ||
        (allowPersonaSessions() && !current?.email),
      'EMAIL_NOT_VERIFIED',
      'Подтвердите email, чтобы продолжить.',
      403,
    )
  }

  staff(user: User | null): User {
    const { clock, hasActiveShift } = this.dependencies

    const actor = this.actor(user, ['cafe', 'pickup'])
    // Existing confirmed reservations still need fulfilment while a venue is reviewed.
    this.venue(actor)
    if (actor.role === 'pickup') {
      const shift = hasActiveShift(actor.id, actor.venueId!, clock(), clock())
      invariant(
        shift,
        'SHIFT_CLOSED',
        'Смена закончилась. Попросите владельца заведения подтвердить выдачу.',
        403,
      )
    }
    return actor
  }
}
