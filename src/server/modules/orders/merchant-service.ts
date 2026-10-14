import { invariant } from '../../../domain/errors.ts'
import type { MerchantResponse, Order, User } from '../../../domain/types.ts'
import {
  object,
  keys,
  idempotencyKey,
  pickupCode,
} from '../../../domain/validation.ts'
import { cafeCancellation } from '../../../domain/order-lifecycle-validation.ts'
import type { MerchantOrderDependencies as Dependencies } from './contracts.ts'

export class MerchantOrderService {
  private readonly dependencies: Dependencies

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies
  }

  merchant(user: User | null): MerchantResponse {
    const { repository, work, authorization } = this.dependencies

    const actor = authorization.actor(user, ['cafe', 'pickup'])
    if (actor.role === 'pickup') authorization.staff(actor)
    const venue = authorization.venue(actor)
    return work.run(() => ({
      offers: repository.offers(venue.id),
      orders: repository.orders({ venueId: venue.id }),
      orderIssues:
        actor.role === 'cafe' ? repository.orderIssues(venue.id) : [],
      venue,
      serverNow: work.now(),
    }))
  }

  merchantCancelOrder(
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
      pauseOffer,
    } = this.dependencies

    const input = cafeCancellation(value)
    return work.run(() => {
      const actor = authorization.actor(user, ['cafe'])
      authorization.verified(actor)
      const order = repository.order(id)
      invariant(
        order && order.venueId === actor.venueId,
        'ORDER_NOT_FOUND',
        'Заказ не найден.',
        404,
      )
      const payload = { orderId: id, reason: input.reason, note: input.note }
      if (
        work.replay(
          actor,
          input.idempotencyKey,
          'merchant-cancel-order',
          payload,
        )
      )
        return { order: repository.order(id)!, serverNow: work.now() }
      invariant(
        order.status === 'confirmed',
        'ORDER_STATE_CONFLICT',
        'Этот заказ нельзя отменить.',
        409,
      )
      invariant(
        clock() < Date.parse(order.snapshot.pickupEnd),
        'CANCELLATION_CLOSED',
        'Время самовывоза завершилось.',
        409,
      )
      commands.cancelByCafe(id, input.reason, input.note, work.now())
      pauseOffer(order.offerId, actor.venueId!)
      work.event(
        id,
        'cancelled',
        actor.name,
        'Заведение отменило подтверждённый заказ. Предложение приостановлено.',
      )
      recordNotifications(repository.order(id)!, 'cancelled', clock())
      work.remember(
        actor,
        input.idempotencyKey,
        'merchant-cancel-order',
        payload,
        id,
      )
      return { order: repository.order(id)!, serverNow: work.now() }
    })
  }

  lookupPickup(
    user: User | null,
    value: unknown,
  ): { order: Order; serverNow: string } {
    const { repository, work, authorization } = this.dependencies

    const actor = authorization.staff(user)
    const code = pickupCode(value)
    return work.run(() => {
      const order = repository.orderByCode(code)
      invariant(
        order && order.venueId === actor.venueId,
        'PICKUP_NOT_FOUND',
        'Код не найден в вашем заведении.',
        404,
      )
      return { order, serverNow: work.now() }
    })
  }

  collect(
    user: User | null,
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

    const actor = authorization.staff(user)
    const input = object(value)
    keys(input, ['code', 'idempotencyKey'])
    const code = pickupCode(input.code)
    const key = idempotencyKey(input.idempotencyKey)
    const payload = { code }
    return work.run(() => {
      const existing = work.replay(actor, key, 'collect', payload)
      if (existing)
        return {
          order: repository.order(existing)!,
          serverNow: work.now(),
        }
      const order = repository.orderByCode(code)
      invariant(
        order && order.venueId === actor.venueId,
        'PICKUP_NOT_FOUND',
        'Код не найден в вашем заведении.',
        404,
      )
      invariant(
        order.status !== 'collected',
        'ALREADY_COLLECTED',
        'Этот заказ уже выдан.',
        409,
      )
      invariant(
        order.status !== 'not_collected',
        'OUTSIDE_PICKUP_WINDOW',
        'Время выдачи этого заказа завершилось.',
        409,
      )
      invariant(
        order.status === 'confirmed',
        'ORDER_STATE_CONFLICT',
        'Заказ не готов к выдаче.',
        409,
      )
      invariant(
        clock() >= Date.parse(order.snapshot.pickupStart) &&
          clock() < Date.parse(order.snapshot.pickupEnd),
        'OUTSIDE_PICKUP_WINDOW',
        'Сейчас не время выдачи этого заказа.',
        409,
      )
      commands.collect(order.id)
      work.event(
        order.id,
        'collected',
        actor.name,
        'Сотрудник подтвердил фактическую передачу заказа.',
      )
      recordNotifications(repository.order(order.id)!, 'collected', clock())
      work.remember(actor, key, 'collect', payload, order.id)
      return { order: repository.order(order.id)!, serverNow: work.now() }
    })
  }
}
