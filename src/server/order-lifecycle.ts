import { randomUUID } from 'node:crypto'
import { invariant } from '../domain/errors.ts'
import type { Repository } from './repository.ts'
import { recordOrderNotifications } from './notifications.ts'

/** Internal synchronous variant: the caller already owns the marketplace transaction. */
export function finalizeUncollectedOrdersInTransaction(
  repository: Repository,
  now: number,
  limit?: number,
): number {
  const at = new Date(now).toISOString()
  const rows = repository.db
    .prepare(
      `SELECT id FROM orders WHERE status='confirmed' AND json_extract(snapshot,'$.pickupEnd')<=?
      ORDER BY json_extract(snapshot,'$.pickupEnd'),id ${limit === undefined ? '' : 'LIMIT ?'}`,
    )
    .all(at, ...(limit === undefined ? [] : [limit])) as { id: string }[]
  let finalized = 0
  for (const row of rows) {
    const order = repository.order(row.id)!
    const changed = repository.db
      .prepare(
        `UPDATE orders SET status='not_collected' WHERE id=? AND status='confirmed'
        AND json_extract(snapshot,'$.pickupEnd')<=?`,
      )
      .run(order.id, at)
    if (Number(changed.changes) !== 1) continue
    repository.event(order.id, {
      id: randomUUID(),
      type: 'not_collected',
      at: order.snapshot.pickupEnd,
      actorName: 'Система',
      message: 'Окно самовывоза завершилось. Получение заказа не подтверждено.',
    })
    recordOrderNotifications(
      repository,
      repository.order(order.id)!,
      'not_collected',
      now,
    )
    finalized++
  }
  return finalized
}

/** Workers drain bounded batches after restart; normal order reads also close overdue bookings. */
export function finalizeUncollectedOrders(
  repository: Repository,
  now: number,
  limit = 100,
): number {
  invariant(
    Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 1000 &&
      Number.isFinite(now),
    'INVALID_INPUT',
    'Недопустимый предел завершения заказов.',
  )
  return repository.transaction(() =>
    finalizeUncollectedOrdersInTransaction(repository, now, limit),
  )
}
