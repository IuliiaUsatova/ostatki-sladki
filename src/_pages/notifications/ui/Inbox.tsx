'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import type {
  Notification,
  NotificationReadResponse,
  NotificationsReadResponse,
  NotificationsResponse,
  User,
} from '@/shared/api'
import { api, useResource } from '@/shared/api'
import { BuyerShell } from '@/shared/ui/app-shell'
import { ErrorState, Loading } from '@/shared/ui/feedback'
import { useNotificationI18n } from '@/entities/notification'
import { notifyReadStateChanged } from '@/entities/notification'
import { notificationsStyles as styles } from '@/shared/ui/notification-layout'

export default function Inbox() {
  const { t } = useNotificationI18n()
  const session = useResource<{ user: User | null }>('/api/session')
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const user = session.data?.user
  return (
    <BuyerShell
      title={t('title')}
      back={
        user && ['cafe', 'pickup'].includes(user.role)
          ? '/merchant'
          : '/profile'
      }
      nav={false}
    >
      <p className={styles.intro}>{t('intro')}</p>
      {session.loading ? (
        <Loading />
      ) : session.error ? (
        <ErrorState error={session.error} retry={session.reload} />
      ) : !user ? (
        <section className={styles.panel}>
          <h2>{t('loginNeeded')}</h2>
          <p className={styles.intro}>{t('loginHint')}</p>
          <Link className="button" href="/login?next=/notifications">
            {t('signIn')}
          </Link>
        </section>
      ) : (
        <>
          <div className={styles.tabs}>
            {(['all', 'unread'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {t(value)}
              </button>
            ))}
          </div>
          <InboxList key={`${user.id}:${filter}`} user={user} filter={filter} />
          <Link href="/profile" className={styles.settingsLink}>
            {t('preferences')}
          </Link>
        </>
      )}
    </BuyerShell>
  )
}

function InboxList({ user, filter }: { user: User; filter: 'all' | 'unread' }) {
  const { t, errorText } = useNotificationI18n()
  const [page, setPage] = useState<NotificationsResponse | null>(null)
  const [loadFailure, setLoadFailure] = useState<unknown>(null)
  const [failedCursor, setFailedCursor] = useState<string | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markedAll, setMarkedAll] = useState(false)
  const dataController = useRef<AbortController | null>(null)
  const mutationController = useRef<AbortController | null>(null)
  const url = `/api/notifications?limit=20&filter=${filter}`
  useEffect(() => {
    const controller = new AbortController()
    dataController.current = controller
    void api<NotificationsResponse>(url, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setPage(result)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadFailure(error)
      })
    return () => {
      controller.abort()
      dataController.current?.abort()
      mutationController.current?.abort()
    }
  }, [url])

  async function load(cursor: string | null = null) {
    if (loadingMore || busyId) return
    dataController.current?.abort()
    const controller = new AbortController()
    dataController.current = controller
    setLoadingMore(true)
    setLoadFailure(null)
    setFailedCursor(cursor)
    setFailure(null)
    try {
      const result = await api<NotificationsResponse>(
        `${url}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal: controller.signal },
      )
      if (controller.signal.aborted) return
      setPage((previous) =>
        cursor && previous
          ? {
              ...result,
              notifications: [
                ...previous.notifications,
                ...result.notifications,
              ].filter(
                (notification, index, list) =>
                  list.findIndex((item) => item.id === notification.id) ===
                  index,
              ),
            }
          : result,
      )
    } catch (error) {
      if (!controller.signal.aborted) setLoadFailure(error)
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false)
    }
  }
  async function read(id: string | null) {
    if (busyId || loadingMore || !page) return
    const controller = new AbortController()
    mutationController.current = controller
    setBusyId(id ?? 'all')
    setFailure(null)
    setMarkedAll(false)
    try {
      if (id) {
        const result = await api<NotificationReadResponse>(
          `/api/notifications/${encodeURIComponent(id)}/read`,
          { method: 'PATCH', signal: controller.signal },
        )
        if (controller.signal.aborted) return
        setPage((previous) =>
          previous
            ? {
                ...previous,
                unreadCount: result.unreadCount,
                notifications: previous.notifications
                  .map((notification) =>
                    notification.id === id ? result.notification : notification,
                  )
                  .filter(
                    (notification) =>
                      filter === 'all' || notification.readAt === null,
                  ),
              }
            : previous,
        )
      } else {
        const result = await api<NotificationsReadResponse>(
          '/api/notifications/read',
          {
            method: 'PATCH',
            body: JSON.stringify({}),
            signal: controller.signal,
          },
        )
        if (controller.signal.aborted) return
        setPage((previous) =>
          previous
            ? {
                ...previous,
                unreadCount: result.unreadCount,
                notifications:
                  filter === 'unread'
                    ? []
                    : previous.notifications.map((notification) => ({
                        ...notification,
                        readAt: notification.readAt ?? result.serverNow,
                      })),
                nextCursor: filter === 'unread' ? null : previous.nextCursor,
              }
            : previous,
        )
        setMarkedAll(true)
      }
      notifyReadStateChanged()
    } catch (error) {
      if (!controller.signal.aborted) setFailure(error)
    } finally {
      if (!controller.signal.aborted) setBusyId(null)
    }
  }
  return (
    <div className={styles.sections}>
      <div className={styles.toolbar}>
        <span className={styles.count}>
          {page ? t('unreadCount', { count: page.unreadCount }) : t('loading')}
        </span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={loadingMore || !!busyId}
            onClick={() => load()}
          >
            {t(loadingMore ? 'loading' : 'refresh')}
          </button>
          <button
            type="button"
            className={styles.secondary}
            disabled={
              !page || page.unreadCount === 0 || loadingMore || !!busyId
            }
            onClick={() => read(null)}
          >
            {t(busyId === 'all' ? 'working' : 'markAllRead')}
          </button>
        </div>
      </div>
      {markedAll && (
        <p className={styles.success} role="status">
          {t('markedAll')}
        </p>
      )}
      {failure !== null && (
        <div className={styles.error} role="alert">
          <p>{errorText(failure)}</p>
          <button
            className={styles.secondary}
            type="button"
            disabled={!!busyId || loadingMore}
            onClick={() => load()}
          >
            {t('refresh')}
          </button>
        </div>
      )}
      {loadFailure !== null && (
        <ErrorState error={loadFailure} retry={() => void load(failedCursor)} />
      )}
      {!page && !loadFailure ? (
        <Loading />
      ) : page && page.notifications.length === 0 ? (
        <section className={styles.empty}>
          <h2>{t('emptyTitle')}</h2>
          <p>{t(filter === 'unread' ? 'emptyUnread' : 'emptyAll')}</p>
        </section>
      ) : (
        page && (
          <ol className={styles.list}>
            {page.notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationCard
                  notification={notification}
                  user={user}
                  pending={busyId === notification.id}
                  disabled={!!busyId || loadingMore}
                  onRead={() => read(notification.id)}
                />
              </li>
            ))}
          </ol>
        )
      )}
      {page?.nextCursor && (
        <button
          type="button"
          className={styles.secondary}
          disabled={loadingMore || !!busyId}
          onClick={() => load(page.nextCursor)}
        >
          {t(loadingMore ? 'loading' : 'loadMore')}
        </button>
      )}
      {page?.notifications.some(
        (notification) => notification.emailStatus === 'accepted',
      ) && <p className={styles.hint}>{t('acceptedHint')}</p>}
    </div>
  )
}

function NotificationCard({
  notification,
  user,
  pending,
  disabled,
  onRead,
}: {
  notification: Notification
  user: User
  pending: boolean
  disabled: boolean
  onRead: () => void
}) {
  const { t, locale, formatDate, formatTime, formatMoney } =
    useNotificationI18n()
  const details = notification.payload
  const text = details.translations[locale]
  const href =
    user.role === 'buyer'
      ? `/orders/${encodeURIComponent(details.orderId)}`
      : ['cafe', 'pickup'].includes(user.role)
        ? `/merchant?order=${encodeURIComponent(details.orderId)}`
        : null
  return (
    <article className={styles.card} data-unread={notification.readAt === null}>
      <div className={styles.meta}>
        <span
          className={notification.readAt === null ? styles.unread : undefined}
        >
          {t(notification.readAt === null ? 'unreadBadge' : 'readBadge')}
        </span>
        <time dateTime={notification.createdAt}>
          {formatDate(notification.createdAt)} ·{' '}
          {formatTime(notification.createdAt)}
        </time>
      </div>
      <h2>{t(`kind.${notification.kind}`)}</h2>
      <p className={styles.body}>{t(`body.${notification.kind}`)}</p>
      {details.cancellation && (
        <p className={styles.body}>
          {t(`cancellation.${details.cancellation.source}`)}
          {details.cancellation.reason && (
            <> · {t(`reason.${details.cancellation.reason}`)}</>
          )}
        </p>
      )}
      <section className={styles.snapshot}>
        <p>
          {details.venueName} ·{' '}
          {t('orderNumber', { number: details.orderNumber })}
        </p>
        <h3>{text.title}</h3>
        <div className={styles.total}>
          <span>{t('quantity', { count: details.quantity })}</span>
          <strong>{formatMoney(details.total)}</strong>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>{t('pickupWindow')}</dt>
            <dd>
              {formatDate(details.pickupStart)} ·{' '}
              {formatTime(details.pickupStart)}–{formatTime(details.pickupEnd)}
            </dd>
          </div>
          <div>
            <dt>{t('address')}</dt>
            <dd>{details.address}</dd>
          </div>
        </dl>
      </section>
      {notification.emailStatus && (
        <p className={styles.delivery} data-status={notification.emailStatus}>
          {t(`email.${notification.emailStatus}`)}
        </p>
      )}
      <div className={styles.actions}>
        {href && (
          <Link className={styles.secondary} href={href}>
            {t(user.role === 'buyer' ? 'openOrder' : 'openMerchant')}
          </Link>
        )}
        {notification.readAt === null && (
          <button
            type="button"
            className={styles.primary}
            disabled={disabled}
            onClick={onRead}
          >
            {t(pending ? 'working' : 'markRead')}
          </button>
        )}
      </div>
    </article>
  )
}
