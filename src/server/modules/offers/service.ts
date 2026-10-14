import { randomUUID } from 'node:crypto'
import { invariant } from '../../../domain/errors.ts'
import type { CreateOfferInput, Offer, User } from '../../../domain/types.ts'
import {
  object,
  createOfferInput,
  patchOfferInput,
  pickupWindow,
} from '../../../domain/validation.ts'
import type { Repository } from '../../repository.ts'
import type { SqliteOfferCommands } from '../../infrastructure/sqlite/offer-commands.ts'
import type { Authorization } from '../authorization/service.ts'
import type { MarketplaceWork } from '../marketplace/work.ts'
type Dependencies = {
  repository: Pick<Repository, 'offer' | 'offers' | 'venue'>
  commands: Pick<SqliteOfferCommands, 'update' | 'insert'>
  authorization: Authorization
  work: MarketplaceWork
  clock: () => number
  assertOwnedPhoto: (actor: User, id: string) => void
}
export class OfferService {
  private readonly dependencies: Dependencies

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies
  }

  listOffers(): { offers: Offer[]; serverNow: string } {
    const { repository, clock, work } = this.dependencies

    return work.run(() => ({
      offers: repository
        .offers()
        .filter(
          (offer) =>
            offer.status === 'published' &&
            Date.parse(offer.pickupEnd) > clock() &&
            repository.venue(offer.venueId)?.status === 'approved',
        ),
      serverNow: work.now(),
    }))
  }

  getOffer(id: string): { offer: Offer; serverNow: string } {
    const { repository, clock, work } = this.dependencies

    return work.run(() => {
      const offer = repository.offer(id)
      invariant(
        offer &&
          offer.status === 'published' &&
          Date.parse(offer.pickupEnd) > clock() &&
          repository.venue(offer.venueId)?.status === 'approved',
        'OFFER_NOT_FOUND',
        'Предложение больше недоступно.',
        404,
      )
      return { offer, serverNow: work.now() }
    })
  }

  patchOffer(
    user: User | null,
    id: string,
    value: unknown,
  ): { offer: Offer; serverNow: string } {
    const {
      repository,
      commands,
      clock,
      work,
      authorization,
      assertOwnedPhoto,
    } = this.dependencies

    const actor = authorization.actor(user, ['cafe'])
    const input = patchOfferInput(value)
    const pauseOnly =
      input.status === 'paused' && Object.keys(object(value)).length === 1
    return work.run(() => {
      if (!pauseOnly) authorization.verified(actor)
      const venue = authorization.venue(actor, !pauseOnly)
      const offer = repository.offer(id)
      invariant(
        offer && offer.venueId === venue.id,
        'OFFER_NOT_FOUND',
        'Предложение не найдено.',
        404,
      )
      const quantity = input.totalQuantity ?? offer.totalQuantity
      invariant(
        quantity >= offer.totalQuantity - offer.available,
        'CAPACITY_BELOW_COMMITTED',
        'Количество не может быть меньше уже забронированных и выданных порций.',
        409,
      )
      const price = input.price ?? offer.price
      invariant(
        price <= offer.originalPrice,
        'INVALID_INPUT',
        'Цена со скидкой не может превышать обычную цену.',
      )
      const start = input.pickupStart ?? offer.pickupStart
      const end = input.pickupEnd ?? offer.pickupEnd
      if (input.image?.startsWith('/api/photos/'))
        assertOwnedPhoto(actor, input.image.slice('/api/photos/'.length))
      if (
        input.pickupStart !== undefined ||
        input.pickupEnd !== undefined ||
        input.status === 'published'
      )
        pickupWindow(start, end, clock())
      commands.update({
        id,
        totalQuantity: quantity,
        price,
        pickupStart: start,
        pickupEnd: end,
        status: input.status ?? offer.status,
        image: input.image ?? offer.image,
      })
      return { offer: repository.offer(id)!, serverNow: work.now() }
    })
  }

  createOffer(
    user: User | null,
    value: unknown,
  ): { offer: Offer; serverNow: string } {
    const {
      repository,
      commands,
      clock,
      work,
      authorization,
      assertOwnedPhoto,
    } = this.dependencies

    const actor = authorization.actor(user, ['cafe'])
    const input = createOfferInput(value)
    const payload: CreateOfferInput = { ...input }
    delete payload.idempotencyKey
    return work.run(() => {
      const venue = authorization.venue(actor, true)
      if (input.idempotencyKey) {
        const existing = work.replay(
          actor,
          input.idempotencyKey,
          'create-offer',
          payload,
        )
        if (existing)
          return {
            offer: repository.offer(existing)!,
            serverNow: work.now(),
          }
      }
      authorization.verified(actor)
      if (input.image.startsWith('/api/photos/'))
        assertOwnedPhoto(actor, input.image.slice('/api/photos/'.length))
      pickupWindow(input.pickupStart, input.pickupEnd, clock())
      const baseline = {
        title: input.title,
        description: input.description,
        guarantee: input.guarantee,
        allergens: input.allergens,
      }
      const translations = { ...input.translations, ru: baseline }
      const id = randomUUID()
      commands.insert({
        id,
        venueId: venue.id,
        kind: input.kind,
        price: input.price,
        originalPrice: input.originalPrice,
        totalQuantity: input.totalQuantity,
        image: input.image,
        pickupStart: input.pickupStart,
        pickupEnd: input.pickupEnd,
        translations,
      })
      if (input.idempotencyKey)
        work.remember(actor, input.idempotencyKey, 'create-offer', payload, id)
      return { offer: repository.offer(id)!, serverNow: work.now() }
    })
  }
}
