import type { DatabaseSync } from 'node:sqlite'
import type {
  Order,
  OrderEvent,
  OrderSnapshot,
  OrderCancellation,
} from '../../../domain/types.ts'
type Row = Record<string, unknown>
export function getOrder(db: DatabaseSync, id: string): Order | null {
  const row = db
    .prepare(
      'SELECT o.*,u.name AS buyer_name FROM orders o JOIN users u ON u.id=o.buyer_id WHERE o.id=?',
    )
    .get(id) as Row | undefined
  return row ? mapOrder(db, row) : null
}

export function getOrderByCode(db: DatabaseSync, code: string): Order | null {
  const row = db
    .prepare('SELECT id FROM orders WHERE pickup_code=?')
    .get(code) as Row | undefined
  return row ? getOrder(db, String(row.id)) : null
}

export function listOrders(
  db: DatabaseSync,
  scope: { buyerId: string } | { venueId: string },
): Order[] {
  const isBuyer = 'buyerId' in scope
  const rows = db
    .prepare(
      `SELECT o.*,u.name AS buyer_name FROM orders o JOIN users u ON u.id=o.buyer_id WHERE ${isBuyer ? 'o.buyer_id' : 'o.venue_id'}=? ORDER BY o.rowid DESC`,
    )
    .all(isBuyer ? scope.buyerId : scope.venueId) as Row[]
  return rows.map((row) => mapOrder(db, row))
}

function mapOrder(db: DatabaseSync, row: Row): Order {
  const events = db
    .prepare('SELECT * FROM order_events WHERE order_id=? ORDER BY rowid')
    .all(String(row.id)) as Row[]
  return {
    id: String(row.id),
    number: String(row.number),
    buyerId: String(row.buyer_id),
    buyerName: String(row.buyer_name),
    offerId: String(row.offer_id),
    venueId: String(row.venue_id),
    snapshot: JSON.parse(String(row.snapshot)) as OrderSnapshot,
    quantity: Number(row.quantity),
    total: Number(row.total),
    status: row.status as Order['status'],
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    pickupCode: row.pickup_code === null ? null : String(row.pickup_code),
    cancellation: getOrderCancellation(db, String(row.id)),
    events: events.map((event) => ({
      id: String(event.id),
      type: event.type as OrderEvent['type'],
      at: String(event.at),
      actorName: String(event.actor_name),
      message: String(event.message),
    })),
  }
}

export function getOrderCancellation(
  db: DatabaseSync,
  id: string,
): OrderCancellation | null {
  const row = db
    .prepare(
      'SELECT source,reason,note,at FROM order_cancellations WHERE order_id=?',
    )
    .get(id) as Row | undefined
  return row
    ? {
        source: row.source as OrderCancellation['source'],
        reason: row.reason as OrderCancellation['reason'],
        note: String(row.note),
        at: String(row.at),
      }
    : null
}

export function insertOrderEvent(
  db: DatabaseSync,
  orderId: string,
  event: OrderEvent,
) {
  db.prepare('INSERT INTO order_events VALUES (?,?,?,?,?,?)').run(
    event.id,
    orderId,
    event.type,
    event.at,
    event.actorName,
    event.message,
  )
}
