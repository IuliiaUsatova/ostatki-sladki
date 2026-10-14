import type { DatabaseSync } from 'node:sqlite'
import type {
  CafeCancellationReason,
  OrderSnapshot,
} from '../../../domain/types.ts'

export class SqliteOrderCommands {
  private readonly database: DatabaseSync

  constructor(database: DatabaseSync) {
    this.database = database
  }

  count(): number {
    return Number(
      this.database.prepare('SELECT COUNT(*) AS count FROM orders').get()!
        .count,
    )
  }

  insertReserved(input: {
    id: string
    number: string
    buyerId: string
    offerId: string
    venueId: string
    snapshot: OrderSnapshot
    quantity: number
    total: number
    createdAt: string
    expiresAt: string
  }): void {
    this.database
      .prepare(
        "INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,'reserved',?,?,NULL)",
      )
      .run(
        input.id,
        input.number,
        input.buyerId,
        input.offerId,
        input.venueId,
        JSON.stringify(input.snapshot),
        input.quantity,
        input.total,
        input.createdAt,
        input.expiresAt,
      )
  }

  confirm(id: string, code: string): void {
    this.database
      .prepare("UPDATE orders SET status='confirmed',pickup_code=? WHERE id=?")
      .run(code, id)
  }

  cancelByBuyer(id: string, at: string): void {
    this.database
      .prepare("UPDATE orders SET status='cancelled' WHERE id=?")
      .run(id)
    this.database
      .prepare("INSERT INTO order_cancellations VALUES (?,'buyer',NULL,'',?)")
      .run(id, at)
  }

  cancelByCafe(
    id: string,
    reason: CafeCancellationReason,
    note: string,
    at: string,
  ): void {
    this.database
      .prepare(
        "UPDATE orders SET status='cancelled' WHERE id=? AND status='confirmed'",
      )
      .run(id)
    this.database
      .prepare("INSERT INTO order_cancellations VALUES (?,'cafe',?,?,?)")
      .run(id, reason, note, at)
  }

  collect(id: string): void {
    this.database
      .prepare("UPDATE orders SET status='collected' WHERE id=?")
      .run(id)
  }

  expiredReservations(at: string): { id: string }[] {
    return this.database
      .prepare(
        "SELECT id FROM orders WHERE status='reserved' AND expires_at<=?",
      )
      .all(at) as { id: string }[]
  }

  expire(id: string): void {
    this.database
      .prepare(
        "UPDATE orders SET status='expired' WHERE id=? AND status='reserved'",
      )
      .run(id)
  }
}
