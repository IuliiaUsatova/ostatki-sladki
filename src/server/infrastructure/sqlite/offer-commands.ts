import type { DatabaseSync } from 'node:sqlite'
import type {
  OfferKind,
  OfferStatus,
  OfferTranslation,
  Locale,
} from '../../../domain/types.ts'

export class SqliteOfferCommands {
  private readonly database: DatabaseSync

  constructor(database: DatabaseSync) {
    this.database = database
  }

  pauseOwned(id: string, venueId: string): void {
    this.database
      .prepare("UPDATE offers SET status='paused' WHERE id=? AND venue_id=?")
      .run(id, venueId)
  }

  update(input: {
    id: string
    totalQuantity: number
    price: number
    pickupStart: string
    pickupEnd: string
    status: OfferStatus
    image: string
  }): void {
    this.database
      .prepare(
        'UPDATE offers SET total_quantity=?,price=?,pickup_start=?,pickup_end=?,status=?,image=? WHERE id=?',
      )
      .run(
        input.totalQuantity,
        input.price,
        input.pickupStart,
        input.pickupEnd,
        input.status,
        input.image,
        input.id,
      )
  }

  insert(input: {
    id: string
    venueId: string
    kind: OfferKind
    price: number
    originalPrice: number
    totalQuantity: number
    image: string
    pickupStart: string
    pickupEnd: string
    translations: Record<Locale, OfferTranslation>
  }): void {
    this.database
      .prepare("INSERT INTO offers VALUES (?,?,?,?,?,?,?,?,?,'published',?,?)")
      .run(
        input.id,
        input.venueId,
        input.kind,
        input.price,
        input.originalPrice,
        input.totalQuantity,
        input.image,
        input.pickupStart,
        input.pickupEnd,
        0.8,
        JSON.stringify(input.translations),
      )
  }
}
