import { randomUUID } from 'node:crypto'
import type {
  Locale,
  NotificationKind,
  NotificationSnapshot,
} from '../domain/types.ts'
import type { Repository } from './repository.ts'
import {
  generateDueReminders,
  notificationPreferences,
} from './notifications.ts'
import { createOrderMailer, OrderMailError } from './order-mail.ts'
import type { OrderMail, OrderMailer } from './order-mail.ts'
import { finalizeUncollectedOrders } from './order-lifecycle.ts'

export const NOTIFICATION_LEASE_MS = 45_000
export const MAX_NOTIFICATION_ATTEMPTS = 6
type OutboxRow = {
  id: string
  user_id: string
  order_id: string
  kind: NotificationKind
  locale: Locale
  payload: string
  attempts: number
  lease_token: string
}
export type NotificationTickResult = {
  claimed: number
  accepted: number
  retried: number
  failed: number
  skipped: number
  reminders: number
  closedOrders: number
  skippedBusy: boolean
  configurationUnavailable: boolean
}

const workerState = globalThis as typeof globalThis & {
  ostatkiNotificationTickRunning?: boolean
}
const emptyResult = (): NotificationTickResult => ({
  claimed: 0,
  accepted: 0,
  retried: 0,
  failed: 0,
  skipped: 0,
  reminders: 0,
  closedOrders: 0,
  skippedBusy: false,
  configurationUnavailable: false,
})

function claim(repository: Repository, now: number): OutboxRow | null {
  return repository.transaction(() => {
    const row = repository.db
      .prepare(
        `SELECT id,user_id,order_id,kind,locale,payload,attempts FROM email_outbox
      WHERE attempts<? AND ((status='pending' AND next_attempt_at<=?) OR (status='processing' AND lease_until<=?))
      ORDER BY next_attempt_at,id LIMIT 1`,
      )
      .get(MAX_NOTIFICATION_ATTEMPTS, now, now) as
      | Omit<OutboxRow, 'lease_token'>
      | undefined
    if (!row) return null
    const token = randomUUID()
    repository.db
      .prepare(
        "UPDATE email_outbox SET status='processing',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?",
      )
      .run(token, now + NOTIFICATION_LEASE_MS, row.id)
    return { ...row, attempts: row.attempts + 1, lease_token: token }
  })
}

function messageFor(
  repository: Repository,
  row: OutboxRow,
  now: number,
): OrderMail | null {
  if (
    !repository.db
      .prepare(
        "SELECT 1 FROM email_outbox WHERE id=? AND status='processing' AND lease_token=? AND lease_until>?",
      )
      .get(row.id, row.lease_token, now)
  )
    return null
  const user = repository.user(row.user_id)
  const order = repository.order(row.order_id)
  if (!user?.email || !user.emailVerified || !order) return null
  const preferences = notificationPreferences(repository, user)
  if (!preferences.emailEnabled) return null
  const booking = row.kind.startsWith('booking_')
  if (
    booking
      ? user.role !== 'cafe' || user.venueId !== order.venueId
      : user.role !== 'buyer' || user.id !== order.buyerId
  )
    return null
  if (
    ['order_confirmed', 'booking_confirmed', 'pickup_reminder'].includes(
      row.kind,
    )
  ) {
    if (
      order.status !== 'confirmed' ||
      Date.parse(order.snapshot.pickupEnd) <= now
    )
      return null
  } else if (['order_cancelled', 'booking_cancelled'].includes(row.kind)) {
    if (order.status !== 'cancelled') return null
  } else if (['order_collected', 'booking_collected'].includes(row.kind)) {
    if (order.status !== 'collected') return null
  } else if (
    ['order_not_collected', 'booking_not_collected'].includes(row.kind)
  ) {
    if (order.status !== 'not_collected') return null
  } else return null
  let payload: NotificationSnapshot
  try {
    payload = JSON.parse(row.payload) as NotificationSnapshot
  } catch {
    throw new OrderMailError('MAIL_REJECTED', false)
  }
  if (
    !payload ||
    typeof payload !== 'object' ||
    payload.orderId !== row.order_id
  )
    throw new OrderMailError('MAIL_REJECTED', false)
  return {
    kind: row.kind,
    to: user.email,
    locale: row.locale,
    payload,
    idempotencyKey: row.id,
  }
}

function finish(
  repository: Repository,
  row: OutboxRow,
  now: number,
  status: 'accepted' | 'failed' | 'skipped' | 'pending',
  code: string | null = null,
): boolean {
  const paused = code === 'MAIL_CONFIG'
  const delay = paused
    ? 60_000
    : Math.min(30_000 * 2 ** (row.attempts - 1), 300_000)
  return repository.transaction(
    () =>
      repository.db
        .prepare(
          `UPDATE email_outbox SET status=?,next_attempt_at=?,attempts=attempts-?,lease_token=NULL,lease_until=NULL,
    accepted_at=?,last_error_code=? WHERE id=? AND status='processing' AND lease_token=? AND lease_until>?`,
        )
        .run(
          status,
          status === 'pending' ? now + delay : now,
          Number(paused),
          status === 'accepted' ? new Date(now).toISOString() : null,
          code,
          row.id,
          row.lease_token,
          now,
        ).changes === 1,
  )
}

export function createNotificationWorker(
  repository: Repository,
  options: {
    mailer?: OrderMailer
    clock?: () => number
    batchSize?: number
  } = {},
) {
  const mailer = options.mailer ?? createOrderMailer()
  const clock = options.clock ?? Date.now
  const batchSize = Number.isFinite(options.batchSize ?? 10)
    ? Math.max(1, Math.min(10, Math.floor(options.batchSize ?? 10)))
    : 10
  return {
    async tick(): Promise<NotificationTickResult> {
      const result = emptyResult()
      if (workerState.ostatkiNotificationTickRunning)
        return { ...result, skippedBusy: true }
      workerState.ostatkiNotificationTickRunning = true
      try {
        result.closedOrders = finalizeUncollectedOrders(repository, clock())
        result.reminders = generateDueReminders(repository, clock())
        // Normalize crashed workers even while mail is unconfigured, so the inbox does not claim an expired job is still sending.
        result.failed += repository.transaction(() => {
          const now = clock()
          const failed = Number(
            repository.db
              .prepare(
                `UPDATE email_outbox SET status='failed',lease_token=NULL,lease_until=NULL,last_error_code='MAIL_ATTEMPTS_EXHAUSTED'
          WHERE attempts>=? AND (status='pending' OR (status='processing' AND lease_until<=?))`,
              )
              .run(MAX_NOTIFICATION_ATTEMPTS, now).changes,
          )
          repository.db
            .prepare(
              "UPDATE email_outbox SET status='pending',next_attempt_at=?,lease_token=NULL,lease_until=NULL,last_error_code='MAIL_LEASE_EXPIRED' WHERE status='processing' AND lease_until<=?",
            )
            .run(now, now)
          return failed
        })
        // Configuration is checked before leasing: missing credentials leave queued work intact.
        try {
          mailer.assertReady()
        } catch {
          return { ...result, configurationUnavailable: true }
        }
        for (let index = 0; index < batchSize; index++) {
          const row = claim(repository, clock())
          if (!row) break
          result.claimed++
          try {
            const message = messageFor(repository, row, clock())
            if (!message) {
              if (
                finish(repository, row, clock(), 'skipped', 'MAIL_SUPPRESSED')
              )
                result.skipped++
              continue
            }
            // No async gap between the fresh state check and dispatch. Changes after dispatch cannot recall a provider-accepted email.
            await mailer.send(message)
            if (finish(repository, row, clock(), 'accepted')) result.accepted++
          } catch (error) {
            const failure =
              error instanceof OrderMailError
                ? error
                : new OrderMailError('MAIL_TEMPORARY', true)
            const retry =
              failure.code === 'MAIL_CONFIG' ||
              (failure.retryable && row.attempts < MAX_NOTIFICATION_ATTEMPTS)
            if (
              finish(
                repository,
                row,
                clock(),
                retry ? 'pending' : 'failed',
                failure.code,
              )
            ) {
              if (retry) result.retried++
              else result.failed++
            }
          }
        }
        return result
      } finally {
        workerState.ostatkiNotificationTickRunning = false
      }
    },
  }
}
