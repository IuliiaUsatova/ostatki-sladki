import type { DatabaseSync } from 'node:sqlite'
import type {
  Offer,
  Order,
  OrderEvent,
  User,
  Venue,
  VenueApplication,
  VenueProfileContent,
  PhotoAsset,
  OrderCancellation,
  OrderIssue,
  OrderIssueSummary,
  SupportCase,
} from '../domain/types.ts'
import { fixtureSeedingEnabled } from './database-bootstrap.ts'
import type { RepositoryOptions } from './database-bootstrap.ts'
import {
  openDatabase,
  inTransaction,
} from './infrastructure/sqlite/connection.ts'
import { createSchema } from './infrastructure/sqlite/schema.ts'
import { migrateOrderLifecycleSchema } from './infrastructure/sqlite/migrations.ts'
import { bootstrapDatabase } from './infrastructure/sqlite/bootstrap.ts'
import { getUser, getSession } from './infrastructure/sqlite/queries-users.ts'
import {
  getVenue,
  getVenueProfile,
  getPhotoAsset,
  getPhotoAssets,
  getProfilePhotos,
  getVenueApplication,
} from './infrastructure/sqlite/queries-venues.ts'
import { getOffer, listOffers } from './infrastructure/sqlite/queries-offers.ts'
import {
  getOrder,
  getOrderByCode,
  listOrders,
  getOrderCancellation,
  insertOrderEvent,
} from './infrastructure/sqlite/queries-orders.ts'
import {
  getOrderIssue,
  getSupportCase,
  getSupportAssignee,
  listOrderIssues,
} from './infrastructure/sqlite/queries-support.ts'
import {
  getIdempotent,
  recordIdempotency,
} from './infrastructure/sqlite/queries-idempotency.ts'

/** Stable marketplace boundary over SQLite connection, bootstrap and focused queries. */
export class Repository {
  readonly db: DatabaseSync
  readonly databaseFile: string
  readonly seedFixtures: boolean
  constructor(path: string, seedTime: number, options: RepositoryOptions = {}) {
    this.databaseFile = path
    this.seedFixtures =
      options.seedFixtures === undefined
        ? fixtureSeedingEnabled(process.env.NODE_ENV)
        : options.seedFixtures === true
    this.db = openDatabase(path)
    createSchema(this.db)
    try {
      migrateOrderLifecycleSchema(this.db)
    } catch (error) {
      this.db.close()
      throw error
    }
    bootstrapDatabase(this.db, seedTime, this.seedFixtures)
  }
  transaction<T>(operation: () => T): T {
    return inTransaction(this.db, operation)
  }
  close() {
    this.db.close()
  }
  user(id: string): User | null {
    return getUser(this.db, id)
  }
  venue(id: string): Venue | null {
    return getVenue(this.db, id)
  }
  venueProfile(id: string): VenueProfileContent | null {
    return getVenueProfile(this.db, id)
  }
  photoAsset(id: string): PhotoAsset | null {
    return getPhotoAsset(this.db, id)
  }
  photoAssets(venueId: string, ownerId: string): PhotoAsset[] {
    return getPhotoAssets(this.db, venueId, ownerId)
  }
  profilePhotos(venueId: string): PhotoAsset[] {
    return getProfilePhotos(this.db, venueId, this.seedFixtures)
  }
  application(id: string): VenueApplication | null {
    return getVenueApplication(this.db, id, this.seedFixtures)
  }
  session(tokenHash: string, now: number): User | null {
    return getSession(this.db, tokenHash, now)
  }
  offer(id: string): Offer | null {
    return getOffer(this.db, id)
  }
  offers(venueId?: string): Offer[] {
    return listOffers(this.db, venueId)
  }
  order(id: string): Order | null {
    return getOrder(this.db, id)
  }
  orderByCode(code: string): Order | null {
    return getOrderByCode(this.db, code)
  }
  orders(scope: { buyerId: string } | { venueId: string }): Order[] {
    return listOrders(this.db, scope)
  }
  orderCancellation(id: string): OrderCancellation | null {
    return getOrderCancellation(this.db, id)
  }
  orderIssue(orderId: string): OrderIssue | null {
    return getOrderIssue(this.db, orderId)
  }
  supportCase(issueId: string): SupportCase | null {
    return getSupportCase(this.db, issueId)
  }
  supportAssignee(id: string): NonNullable<SupportCase['assignee']> {
    return getSupportAssignee(this.db, id)
  }
  orderIssues(venueId: string): OrderIssueSummary[] {
    return listOrderIssues(this.db, venueId)
  }
  idempotent(
    actorId: string,
    key: string,
  ): { action: string; payloadHash: string; resourceId: string } | null {
    return getIdempotent(this.db, actorId, key)
  }
  remember(
    actorId: string,
    key: string,
    action: string,
    hash: string,
    resourceId: string,
  ) {
    recordIdempotency(this.db, actorId, key, action, hash, resourceId)
  }
  event(orderId: string, event: OrderEvent) {
    insertOrderEvent(this.db, orderId, event)
  }
}
