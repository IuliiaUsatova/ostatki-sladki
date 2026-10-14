import { randomInt, randomUUID } from 'node:crypto'
import { invariant } from '../../../domain/errors.ts'
import type { Order, OrderSnapshot, User } from '../../../domain/types.ts'
import {
  object,
  keys,
  text,
  integer,
  idempotencyKey,
} from '../../../domain/validation.ts'
import type { BuyerOrderDependencies as Dependencies } from './contracts.ts'
export const RESERVATION_TTL_MS = 5 * 60_000

export class BuyerOrderService {
  private readonly dependencies: Dependencies

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies
  }

  reserve(
    user: User | null,
    value: unknown,
  ): { order: Order; serverNow: string } {
    const { repository, commands, clock, work, authorization } =
      this.dependencies

    const actor = authorization.actor(user, ['buyer'])
    const input = object(value)
    keys(input, ['offerId', 'quantity', 'idempotencyKey'])
    const offerId = text(input.offerId, 'предложение', 100)
    const quantity = integer(input.quantity, 'количество', 1, 20)
    const key = idempotencyKey(input.idempotencyKey)
    const payload = { offerId, quantity }
    return work.run(() => {
      const existing = work.replay(actor, key, 'reserve', payload)
      if (existing)
        return {
          order: repository.order(existing)!,
          serverNow: work.now(),
        }
      authorization.verified(actor)
      const offer = repository.offer(offerId)
      invariant(
        offer &&
          offer.status === 'published' &&
          Date.parse(offer.pickupEnd) > clock() &&
          repository.venue(offer.venueId)?.status === 'approved',
        'OFFER_UNAVAILABLE',
        'Предложение больше недоступно.',
        409,
      )
      invariant(
        offer.available >= quantity,
        'INSUFFICIENT_STOCK',
        'Не хватает свободных порций. Обновите количество.',
        409,
      )
      const snapshot: OrderSnapshot = {
        name: offer.title,
        venueName: offer.venueName,
        address: offer.address,
        price: offer.price,
        originalPrice: offer.originalPrice,
        kind: offer.kind,
        allergens: offer.allergens,
        pickupStart: offer.pickupStart,
        pickupEnd: offer.pickupEnd,
        image: offer.image,
        guarantee: offer.guarantee,
        translations: offer.translations,
      }
      const id = randomUUID()
      const count = commands.count()
      const expiresAt = new Date(
        Math.min(clock() + RESERVATION_TTL_MS, Date.parse(offer.pickupEnd)),
      ).toISOString()
      commands.insertReserved({
        id,
        number: `OS-${1001 + count}`,
        buyerId: actor.id,
        offerId: offer.id,
        venueId: offer.venueId,
        snapshot,
        quantity,
        total: offer.price * quantity,
        createdAt: work.now(),
        expiresAt,
      })
      work.event(
        id,
        'reserved',
        actor.name,
        'Порции зарезервированы на 5 минут. Подтвердите заказ для самовывоза.',
      )
      work.remember(actor, key, 'reserve', payload, id)
      return { order: repository.order(id)!, serverNow: work.now() }
    })
  }

  private ownOrder(actor: User, id: string): Order {
    const { repository } = this.dependencies

    const order = repository.order(id)
    invariant(
      order && order.buyerId === actor.id,
      'ORDER_NOT_FOUND',
      'Заказ не найден.',
      404,
    )
    return order
  }

  listOrders(user: User | null): { orders: Order[]; serverNow: string } {
    const { repository, work, authorization } = this.dependencies

    const actor = authorization.actor(user, ['buyer'])
    return work.run(() => ({
      orders: repository.orders({ buyerId: actor.id }),
      serverNow: work.now(),
    }))
  }

  getOrder(user: User | null, id: string): { order: Order; serverNow: string } {
    const { work, authorization } = this.dependencies

    const actor = authorization.actor(user, ['buyer'])
    return work.run(() => ({
      order: this.ownOrder(actor, id),
      serverNow: work.now(),
    }))
  }

  confirm(
    user: User | null,
    id: string,
    value: unknown,
  ): { order: Order; serverNow: string } {
    const {
      repository,
      commands,
      clock,
      work,
      authorization,
      recordNotifications,
    } = this.dependencies

    const actor = authorization.actor(user, ['buyer'])
    const input = object(value)
    keys(input, ['idempotencyKey'])
    const key = idempotencyKey(input.idempotencyKey)
    const payload = { orderId: id }
    return work.run(() => {
      const order = this.ownOrder(actor, id)
      const existing = work.replay(actor, key, 'confirm', payload)
      if (existing)
        return {
          order: repository.order(existing)!,
          serverNow: work.now(),
        }
      authorization.verified(actor)
      invariant(
        order.status !== 'expired',
        'RESERVATION_EXPIRED',
        'Бронь истекла. Выберите предложение заново.',
        409,
      )
      invariant(
        order.status === 'reserved',
        'ORDER_STATE_CONFLICT',
        'Этот заказ уже обработан. Обновите его статус.',
        409,
      )
      invariant(
        repository.offer(order.offerId)?.status === 'published',
        'OFFER_UNAVAILABLE',
        'Предложение временно не принимает новые заказы.',
        409,
      )
      invariant(
        repository.venue(order.venueId)?.status === 'approved',
        'VENUE_PENDING',
        'Заведение временно не принимает новые заказы.',
        403,
      )
      let code = ''
      for (let attempt = 0; attempt < 20; attempt++) {
        code = String(randomInt(100000, 1000000))
        if (!repository.orderByCode(code)) break
        code = ''
      }
      invariant(code, 'RETRY_LATER', 'Попробуйте ещё раз.', 503)
      commands.confirm(id, code)
      work.event(
        id,
        'confirmed',
        actor.name,
        'Бронь подтверждена. Оплата при самовывозе в заведении.',
      )
      recordNotifications(repository.order(id)!, 'confirmed', clock())
      work.remember(actor, key, 'confirm', payload, id)
      return { order: repository.order(id)!, serverNow: work.now() }
    })
  }

  cancel(user: User | null, id: string): { order: Order; serverNow: string } {
    const {
      repository,
      commands,
      clock,
      work,
      authorization,
      recordNotifications,
    } = this.dependencies

    const actor = authorization.actor(user, ['buyer'])
    return work.run(() => {
      const order = this.ownOrder(actor, id)
      if (order.status === 'cancelled') return { order, serverNow: work.now() }
      invariant(
        order.status === 'reserved' || order.status === 'confirmed',
        'ORDER_STATE_CONFLICT',
        'Этот заказ нельзя отменить.',
        409,
      )
      invariant(
        order.status === 'reserved' ||
          clock() < Date.parse(order.snapshot.pickupStart),
        'CANCELLATION_CLOSED',
        'Окно выдачи уже началось. Напишите заведению в обращении по заказу.',
        409,
      )
      commands.cancelByBuyer(id, work.now())
      work.event(
        id,
        'cancelled',
        actor.name,
        order.status === 'reserved'
          ? 'Неоплаченная бронь снята. Порции возвращены в продажу.'
          : 'Заказ отменён до начала самовывоза. Порции возвращены в продажу.',
      )
      if (order.status === 'confirmed')
        recordNotifications(repository.order(id)!, 'cancelled', clock())
      return { order: repository.order(id)!, serverNow: work.now() }
    })
  }
}
