export type UserRole = 'buyer' | 'cafe' | 'pickup' | 'admin'
export type Locale = 'ru' | 'kk' | 'en'
export type Persona =
  | 'buyer'
  | 'buyer-other'
  | 'cafe'
  | 'cafe-other'
  | 'pickup'
  | 'cafe-pending'
export type OfferKind = 'specific_item' | 'surprise_bag'
export type OfferStatus = 'published' | 'paused'
export type OrderStatus =
  | 'reserved'
  | 'confirmed'
  | 'collected'
  | 'cancelled'
  | 'expired'
  | 'not_collected'

export interface User {
  id: string
  name: string
  role: UserRole
  venueId: string | null
  email?: string
  locale?: Locale
  emailVerified?: boolean
}

export type VenueStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested'
  | 'suspended'
export type ModerationAction =
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'suspend'
export interface VenueDetails {
  name: string
  address: string
  description: string
  contactPhone: string
  profile?: VenueProfileContent | null
}

export interface VenueProfileTranslation {
  description: string
  pickupInstructions: string
}

export interface OpeningHoursDay {
  /** Monday is 0; Sunday is 6. Times are local to the venue's timezone. */
  day: number
  closed: boolean
  opens: string
  closes: string
}

export interface VenueProfileContent {
  translations: Record<Locale, VenueProfileTranslation>
  openingHours: OpeningHoursDay[]
  photoIds: string[]
  location?: GeoPoint | null
}

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface PhotoAsset {
  id: string
  url: string
  width: number
  height: number
  bytes: number
  createdAt: string
}

export interface VenueProfileResponse {
  venue: Venue
  profile: VenueProfileContent | null
  photos: PhotoAsset[]
  revision: number
  serverNow: string
}

export type PublicVenueContent = Omit<VenueProfileContent, 'photoIds'>
export interface PublicVenue {
  id: string
  name: string
  address: string
  timezone: string
  profile: PublicVenueContent | null
  photos: PhotoAsset[]
  location: GeoPoint | null
}
export interface PublicVenueResponse {
  venue: PublicVenue
  offers: Offer[]
  serverNow: string
}

export interface NearbySearchInput {
  center: GeoPoint | null
  radiusKm: number | null
  search: string
  kind: 'all' | 'specific_item' | 'surprise_bag'
}
export interface NearbyVenue {
  venue: PublicVenue
  offers: Offer[]
  distanceKm: number | null
}
export interface NearbySearchResponse {
  venues: NearbyVenue[]
  unlocated: NearbyVenue[]
  serverNow: string
  truncated: boolean
}
export interface ModerationEvent {
  id: string
  action: ModerationAction | 'submit'
  at: string
  actorName: string
  revision: number
  reasons: Record<Locale, string> | null
  snapshot: VenueDetails
}
export interface VenueApplication extends VenueDetails {
  id: string
  status: VenueStatus
  timezone: string
  revision: number
  submittedAt: string
  updatedAt: string
  reasons: Record<Locale, string> | null
  owner: { id: string; name: string; email: string | null }
  reviewedAt: string | null
  reviewedBy: string | null
  history: ModerationEvent[]
  photos: PhotoAsset[]
}
export interface VenueApplicationResponse {
  application: VenueApplication
  serverNow: string
}
export interface AdminVenuesResponse {
  venues: VenueApplication[]
  serverNow: string
}

export interface Venue {
  id: string
  name: string
  address: string
  status: VenueStatus
  timezone: string
}

export interface Offer {
  id: string
  title: string
  kind: OfferKind
  venueId: string
  venueName: string
  address: string
  description: string
  guarantee: string
  allergens: string[]
  price: number
  originalPrice: number
  available: number
  totalQuantity: number
  image: string
  pickupStart: string
  pickupEnd: string
  status: OfferStatus
  distanceKm: number | null
  translations: Record<Locale, OfferTranslation>
}

export interface OfferTranslation {
  title: string
  description: string
  guarantee: string
  allergens: string[]
}

export interface OrderSnapshot {
  name: string
  venueName: string
  address: string
  price: number
  originalPrice: number
  kind: OfferKind
  allergens: string[]
  pickupStart: string
  pickupEnd: string
  image: string
  guarantee: string
  translations: Record<Locale, OfferTranslation>
}

export interface OrderEvent {
  id: string
  type:
    | 'reserved'
    | 'confirmed'
    | 'collected'
    | 'cancelled'
    | 'expired'
    | 'not_collected'
  at: string
  actorName: string
  message: string
}

export interface Order {
  id: string
  number: string
  buyerId: string
  buyerName: string
  offerId: string
  venueId: string
  snapshot: OrderSnapshot
  quantity: number
  total: number
  status: OrderStatus
  createdAt: string
  expiresAt: string
  pickupCode: string | null
  cancellation: OrderCancellation | null
  events: OrderEvent[]
}

export type CafeCancellationReason =
  | 'unavailable'
  | 'closed'
  | 'quality_issue'
  | 'other'
export interface OrderCancellation {
  source: 'buyer' | 'cafe'
  reason: CafeCancellationReason | null
  note: string
  at: string
}
export type OrderIssueCategory =
  | 'pickup_problem'
  | 'food_problem'
  | 'cancellation'
  | 'other'
export interface OrderIssueMessage {
  id: string
  authorRole: 'buyer' | 'cafe' | 'admin'
  authorName: string
  body: string
  createdAt: string
}
export interface OrderIssue {
  id: string
  orderId: string
  category: OrderIssueCategory
  status: 'open' | 'answered' | 'resolved'
  revision: number
  createdAt: string
  updatedAt: string
  messages: OrderIssueMessage[]
  support: SupportCase | null
}
export interface OrderIssueResponse {
  issue: OrderIssue | null
  serverNow: string
}

export type SupportStatus = 'new' | 'in_review' | 'waiting' | 'resolved'
export type SupportKind = 'help' | 'complaint'
export type SupportResolutionCode =
  | 'information_provided'
  | 'agreement_reached'
  | 'complaint_upheld'
  | 'complaint_not_upheld'
export interface SupportResolution {
  code: SupportResolutionCode
  texts: Record<Locale, string>
  createdAt: string
  actorName: string
}
export interface SupportEvent {
  id: string
  action:
    | 'opened'
    | 'claimed'
    | 'released'
    | 'waiting'
    | 'resumed'
    | 'replied'
    | 'resolved'
    | 'reopened'
    | 'participant_message'
  actorName: string
  actorRole: 'buyer' | 'cafe' | 'admin'
  createdAt: string
  fromStatus: SupportStatus | null
  toStatus: SupportStatus
  assigneeName: string | null
  note: string | null
  resolution: SupportResolution | null
  reason?: 'assignee_unavailable' | null
}
export interface SupportCase {
  id: string
  kind: SupportKind
  status: SupportStatus
  revision: number
  reporterName: string
  reporterRole: 'buyer' | 'cafe'
  assignee: { id: string; name: string; available: boolean } | null
  createdAt: string
  updatedAt: string
  resolution: SupportResolution | null
  history: SupportEvent[]
}
export interface SupportQueueSummary {
  id: string
  orderId: string
  orderNumber: string
  venueName: string
  buyerName: string
  titles: Record<Locale, string>
  category: OrderIssueCategory
  kind: SupportKind
  status: SupportStatus
  revision: number
  reporterName: string
  reporterRole: 'buyer' | 'cafe'
  assignee: { id: string; name: string; available: boolean } | null
  createdAt: string
  updatedAt: string
}
export interface AdminSupportQueueResponse {
  cases: SupportQueueSummary[]
  counts: Record<SupportStatus, number>
  nextCursor: string | null
  serverNow: string
}
export interface AdminSupportDetailResponse {
  issue: OrderIssue
  order: Omit<Order, 'pickupCode'>
  serverNow: string
}

export interface CreateOfferInput {
  title: string
  kind: OfferKind
  description: string
  guarantee: string
  allergens: string[]
  price: number
  originalPrice: number
  totalQuantity: number
  image: string
  pickupStart: string
  pickupEnd: string
  translations: Record<Locale, OfferTranslation>
  idempotencyKey?: string
}

export interface PatchOfferInput {
  totalQuantity?: number
  status?: OfferStatus
  price?: number
  pickupStart?: string
  pickupEnd?: string
  image?: string
}

export interface MerchantResponse {
  offers: Offer[]
  orders: Order[]
  orderIssues: OrderIssueSummary[]
  venue: Venue
  serverNow: string
}

export interface OrderIssueSummary {
  orderId: string
  status: OrderIssue['status']
  updatedAt: string
}

export type NotificationKind =
  | 'order_confirmed'
  | 'order_cancelled'
  | 'order_collected'
  | 'pickup_reminder'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_collected'
  | 'order_not_collected'
  | 'booking_not_collected'

export interface NotificationSnapshot {
  orderId: string
  orderNumber: string
  venueName: string
  address: string
  translations: Record<Locale, OfferTranslation>
  quantity: number
  total: number
  pickupStart: string
  pickupEnd: string
  cancellation?: Pick<OrderCancellation, 'source' | 'reason'> | null
}

export type NotificationEmailStatus =
  | 'pending'
  | 'processing'
  | 'accepted'
  | 'failed'
  | 'skipped'

export interface Notification {
  id: string
  kind: NotificationKind
  payload: NotificationSnapshot
  createdAt: string
  readAt: string | null
  emailStatus: NotificationEmailStatus | null
}

export interface NotificationsResponse {
  notifications: Notification[]
  unreadCount: number
  nextCursor: string | null
  serverNow: string
}

export interface NotificationPreferences {
  emailEnabled: boolean
  locale: Locale
}

export interface NotificationPreferencesResponse {
  preferences: NotificationPreferences
  serverNow: string
}

export interface NotificationReadResponse {
  notification: Notification
  unreadCount: number
  serverNow: string
}

export interface NotificationsReadResponse {
  unreadCount: number
  serverNow: string
}
