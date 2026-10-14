import type { MerchantResponse, Offer, Order, User } from '../domain/types.ts'
import { Repository } from './repository.ts'
import { loginAccount, registerAccount } from './auth.ts'
import { AuthLifecycle } from './auth-lifecycle.ts'
import { unconfiguredMailer, type AuthMailer } from './mail.ts'
import {
  adminVenues,
  getApplication,
  moderateVenue,
  resubmitApplication,
} from './moderation.ts'
import {
  merchantProfile,
  ownedPhoto,
  publicVenue,
  updateMerchantProfile,
} from './venue-profile.ts'
import {
  getNotificationPreferences,
  listNotifications,
  readAllNotifications,
  readNotification,
  recordOrderNotifications,
  updateNotificationPreferences,
} from './notifications.ts'
import { finalizeUncollectedOrdersInTransaction } from './order-lifecycle.ts'
import {
  getOrderIssue,
  openOrderIssue,
  addOrderIssueMessage,
  resolveOrderIssue,
} from './order-issues.ts'
import {
  escalateOrderIssueSupport,
  adminSupportQueue,
  adminSupportDetail,
  adminSupportMessage,
  adminSupportAction,
} from './support.ts'
import { nearbySearch } from './nearby.ts'

import { MarketplaceAuthorization } from './modules/authorization/service.ts'
import { MarketplaceUnitOfWork } from './modules/marketplace/work.ts'
import { SessionService } from './modules/sessions/service.ts'
import { BuyerOrderService } from './modules/orders/buyer-service.ts'
import { MerchantOrderService } from './modules/orders/merchant-service.ts'
import { OfferService } from './modules/offers/service.ts'
import { SqliteOrderCommands } from './infrastructure/sqlite/order-commands.ts'
import { SqliteOfferCommands } from './infrastructure/sqlite/offer-commands.ts'
import { SqliteSessionCommands } from './infrastructure/sqlite/session-commands.ts'
export { RESERVATION_TTL_MS } from './modules/orders/buyer-service.ts'
export { SESSION_TTL_MS } from './modules/sessions/service.ts'

/** Compatibility entry point; feature services own their individual use cases. */
export class MarketplaceService {
  repository: Repository
  clock: () => number
  allowPersonaSessions: boolean
  authLifecycle: AuthLifecycle
  private readonly authorization: MarketplaceAuthorization
  private readonly work: MarketplaceUnitOfWork
  private readonly sessions: SessionService
  private readonly buyerOrders: BuyerOrderService
  private readonly merchantOrders: MerchantOrderService
  private readonly offers: OfferService

  constructor(
    repository: Repository,
    clock: () => number = Date.now,
    options: {
      allowPersonaSessions?: boolean
      mailer?: AuthMailer
      mailResponseDelayMs?: number
    } = {},
  ) {
    this.repository = repository
    this.clock = clock
    this.allowPersonaSessions = options.allowPersonaSessions === true
    this.authLifecycle = new AuthLifecycle(
      repository,
      clock,
      options.mailer ?? unconfiguredMailer,
      options.mailResponseDelayMs,
    )
    const orderCommands = new SqliteOrderCommands(repository.db)
    const offerCommands = new SqliteOfferCommands(repository.db)
    const sessionCommands = new SqliteSessionCommands(repository.db)
    const currentClock = () => this.clock()
    this.authorization = new MarketplaceAuthorization({
      repository,
      clock: currentClock,
      allowPersonaSessions: () => this.allowPersonaSessions,
      hasActiveShift: (...args) => sessionCommands.activePickupShift(...args),
    })
    this.work = new MarketplaceUnitOfWork({
      repository,
      orders: orderCommands,
      clock: currentClock,
      finalizeOrders: (now) => {
        finalizeUncollectedOrdersInTransaction(repository, now)
      },
    })
    this.sessions = new SessionService({
      repository,
      commands: sessionCommands,
      clock: currentClock,
      allowPersonaSessions: () => this.allowPersonaSessions,
    })
    this.offers = new OfferService({
      repository,
      commands: offerCommands,
      clock: currentClock,
      authorization: this.authorization,
      work: this.work,
      assertOwnedPhoto: (actor, id) => {
        ownedPhoto(repository, actor, id)
      },
    })
    const orderDependencies = {
      repository,
      commands: orderCommands,
      clock: currentClock,
      authorization: this.authorization,
      work: this.work,
      recordNotifications: (
        order: Order,
        event: 'confirmed' | 'cancelled' | 'collected' | 'not_collected',
        now: number,
      ) => recordOrderNotifications(repository, order, event, now),
    }
    this.buyerOrders = new BuyerOrderService(orderDependencies)
    this.merchantOrders = new MerchantOrderService({
      ...orderDependencies,
      pauseOffer: (id, venueId) => offerCommands.pauseOwned(id, venueId),
    })
  }

  now(): string {
    return this.work.now()
  }

  createSession(value: unknown): { token: string; user: User } {
    return this.sessions.createSession(value)
  }

  session(token: string | null): User | null {
    return this.sessions.session(token)
  }

  async register(value: unknown, previousToken: string | null = null) {
    const result = await registerAccount(
      this.repository,
      value,
      previousToken,
      this.clock(),
    )
    let verificationEmailSent = false
    try {
      const sent = await this.authLifecycle.requestVerification(result.user, {
        locale: result.user.locale,
      })
      verificationEmailSent = 'sent' in sent
    } catch {
      // Account creation is durable even when the mail provider cannot accept the first message.
    }
    return { ...result, verificationEmailSent }
  }

  requestVerification(user: User | null, value: unknown) {
    return this.authLifecycle.requestVerification(user, value)
  }

  confirmVerification(user: User | null, value: unknown) {
    return this.authLifecycle.confirmVerification(user, value)
  }

  forgotPassword(value: unknown) {
    return this.authLifecycle.forgot(value)
  }

  resetPassword(value: unknown) {
    return this.authLifecycle.reset(value)
  }

  login(value: unknown, previousToken: string | null = null) {
    return loginAccount(this.repository, value, previousToken, this.clock())
  }

  deleteSession(token: string | null) {
    return this.sessions.deleteSession(token)
  }

  private transaction<T>(callback: () => T): T {
    return this.work.run(callback)
  }

  listOffers(): { offers: Offer[]; serverNow: string } {
    return this.offers.listOffers()
  }

  getOffer(id: string): { offer: Offer; serverNow: string } {
    return this.offers.getOffer(id)
  }

  reserve(
    user: User | null,
    value: unknown,
  ): { order: Order; serverNow: string } {
    return this.buyerOrders.reserve(user, value)
  }

  listOrders(user: User | null): { orders: Order[]; serverNow: string } {
    return this.buyerOrders.listOrders(user)
  }

  getOrder(user: User | null, id: string): { order: Order; serverNow: string } {
    return this.buyerOrders.getOrder(user, id)
  }

  confirm(
    user: User | null,
    id: string,
    value: unknown,
  ): { order: Order; serverNow: string } {
    return this.buyerOrders.confirm(user, id, value)
  }

  cancel(user: User | null, id: string): { order: Order; serverNow: string } {
    return this.buyerOrders.cancel(user, id)
  }

  merchant(user: User | null): MerchantResponse {
    return this.merchantOrders.merchant(user)
  }

  merchantCancelOrder(
    user: User | null,
    id: string,
    value: unknown,
  ): { order: Order; serverNow: string } {
    return this.merchantOrders.merchantCancelOrder(user, id, value)
  }

  patchOffer(
    user: User | null,
    id: string,
    value: unknown,
  ): { offer: Offer; serverNow: string } {
    return this.offers.patchOffer(user, id, value)
  }

  createOffer(
    user: User | null,
    value: unknown,
  ): { offer: Offer; serverNow: string } {
    return this.offers.createOffer(user, value)
  }

  lookupPickup(
    user: User | null,
    value: unknown,
  ): { order: Order; serverNow: string } {
    return this.merchantOrders.lookupPickup(user, value)
  }

  collect(
    user: User | null,
    value: unknown,
  ): { order: Order; serverNow: string } {
    return this.merchantOrders.collect(user, value)
  }

  listVenueApplications(user: User | null) {
    this.authorization.verified(this.authorization.actor(user, ['admin']))
    return adminVenues(this.repository, this.now())
  }

  getVenueApplication(user: User | null, id: string) {
    this.authorization.verified(this.authorization.actor(user, ['admin']))
    return getApplication(this.repository, id, this.now())
  }

  reviewVenue(user: User | null, id: string, value: unknown) {
    const actor = this.authorization.actor(user, ['admin'])
    this.authorization.verified(actor)
    return moderateVenue(this.repository, actor, id, value, this.now())
  }

  merchantApplication(user: User | null) {
    const actor = this.authorization.actor(user, ['cafe'])
    const venue = this.authorization.venue(actor)
    return getApplication(this.repository, venue.id, this.now())
  }

  updateMerchantApplication(user: User | null, value: unknown) {
    const actor = this.authorization.actor(user, ['cafe'])
    const venue = this.authorization.venue(actor)
    return resubmitApplication(
      this.repository,
      actor,
      venue.id,
      value,
      this.now(),
    )
  }

  merchantProfile(user: User | null) {
    return merchantProfile(
      this.repository,
      this.authorization.actor(user, ['cafe']),
      this.now(),
    )
  }

  updateMerchantProfile(user: User | null, value: unknown) {
    const actor = this.authorization.actor(user, ['cafe'])
    this.authorization.verified(actor)
    return updateMerchantProfile(this.repository, actor, value, this.now())
  }

  getPublicVenue(id: string) {
    return this.transaction(() => publicVenue(this.repository, id, this.now()))
  }

  notifications(user: User | null, value: unknown) {
    return listNotifications(this.repository, user, value, this.clock())
  }

  readNotification(user: User | null, id: unknown) {
    return readNotification(this.repository, user, id, this.clock())
  }

  readAllNotifications(user: User | null, value: unknown) {
    return readAllNotifications(this.repository, user, value, this.clock())
  }

  notificationPreferences(user: User | null) {
    return getNotificationPreferences(this.repository, user, this.clock())
  }

  updateNotificationPreferences(user: User | null, value: unknown) {
    return updateNotificationPreferences(
      this.repository,
      user,
      value,
      this.clock(),
    )
  }

  getOrderIssue(user: User | null, id: string) {
    return this.transaction(() =>
      getOrderIssue(this.repository, user, id, this.clock()),
    )
  }

  openOrderIssue(user: User | null, id: string, value: unknown) {
    return this.transaction(() =>
      openOrderIssue(this.repository, user, id, value, this.clock()),
    )
  }

  addOrderIssueMessage(user: User | null, id: string, value: unknown) {
    return this.transaction(() =>
      addOrderIssueMessage(this.repository, user, id, value, this.clock()),
    )
  }

  resolveOrderIssue(user: User | null, id: string, value: unknown) {
    return this.transaction(() =>
      resolveOrderIssue(this.repository, user, id, value, this.clock()),
    )
  }

  escalateOrderIssueSupport(user: User | null, id: string, value: unknown) {
    return this.transaction(() =>
      escalateOrderIssueSupport(this.repository, user, id, value, this.clock()),
    )
  }

  adminSupportQueue(user: User | null, value: unknown) {
    return this.transaction(() =>
      adminSupportQueue(this.repository, user, value, this.clock()),
    )
  }

  adminSupportDetail(user: User | null, id: string) {
    return this.transaction(() =>
      adminSupportDetail(this.repository, user, id, this.clock()),
    )
  }

  adminSupportMessage(user: User | null, id: string, value: unknown) {
    return this.transaction(() =>
      adminSupportMessage(this.repository, user, id, value, this.clock()),
    )
  }

  adminSupportAction(user: User | null, id: string, value: unknown) {
    return this.transaction(() =>
      adminSupportAction(this.repository, user, id, value, this.clock()),
    )
  }

  nearbySearch(value: unknown) {
    return this.transaction(() =>
      nearbySearch(this.repository, value, this.clock()),
    )
  }
}
