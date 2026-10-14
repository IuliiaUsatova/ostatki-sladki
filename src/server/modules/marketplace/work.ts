import { createHash, randomUUID } from 'node:crypto'
import { invariant } from '../../../domain/errors.ts'
import type { OrderEvent, User } from '../../../domain/types.ts'
import type { Repository } from '../../repository.ts'
import type { SqliteOrderCommands } from '../../infrastructure/sqlite/order-commands.ts'

export interface MarketplaceWork {
  now(): string
  run<T>(operation: () => T): T
  event(
    orderId: string,
    type: OrderEvent['type'],
    actorName: string,
    message: string,
  ): void
  replay(
    actor: User,
    key: string,
    action: string,
    payload: unknown,
  ): string | null
  remember(
    actor: User,
    key: string,
    action: string,
    payload: unknown,
    resourceId: string,
  ): void
}

type Dependencies = {
  repository: Pick<
    Repository,
    'transaction' | 'event' | 'idempotent' | 'remember'
  >
  orders: Pick<SqliteOrderCommands, 'expiredReservations' | 'expire'>
  clock: () => number
  finalizeOrders: (now: number) => void
}

const payloadHash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Owns the existing synchronous marketplace transaction and its lifecycle housekeeping. */
export class MarketplaceUnitOfWork implements MarketplaceWork {
  private readonly dependencies: Dependencies

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies
  }

  now(): string {
    return new Date(this.dependencies.clock()).toISOString()
  }

  run<T>(operation: () => T): T {
    const { repository, orders, clock, finalizeOrders } = this.dependencies
    return repository.transaction(() => {
      for (const row of orders.expiredReservations(this.now())) {
        orders.expire(row.id)
        this.event(
          row.id,
          'expired',
          'Система',
          'Время брони истекло. Остаток возвращён в продажу.',
        )
      }
      finalizeOrders(clock())
      return operation()
    })
  }

  event(
    orderId: string,
    type: OrderEvent['type'],
    actorName: string,
    message: string,
  ): void {
    this.dependencies.repository.event(orderId, {
      id: randomUUID(),
      type,
      at: this.now(),
      actorName,
      message,
    })
  }

  replay(
    actor: User,
    key: string,
    action: string,
    payload: unknown,
  ): string | null {
    const existing = this.dependencies.repository.idempotent(actor.id, key)
    if (!existing) return null
    invariant(
      existing.action === action &&
        existing.payloadHash === payloadHash(payload),
      'IDEMPOTENCY_CONFLICT',
      'Этот ключ уже использован для другого запроса. Повторите исходный запрос.',
      409,
    )
    return existing.resourceId
  }

  remember(
    actor: User,
    key: string,
    action: string,
    payload: unknown,
    resourceId: string,
  ): void {
    this.dependencies.repository.remember(
      actor.id,
      key,
      action,
      payloadHash(payload),
      resourceId,
    )
  }
}
