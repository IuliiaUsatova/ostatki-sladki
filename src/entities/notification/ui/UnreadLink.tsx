'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import type { NotificationsResponse } from '@/shared/api'
import { useResource } from '@/shared/api'
import { useNotificationI18n } from '../model/i18n'
import { notificationsStyles as styles } from '@/shared/ui/notification-layout'

export const notificationReadEvent = 'ostatki:notification-read'
export function notifyReadStateChanged() {
  window.dispatchEvent(new Event(notificationReadEvent))
}

export default function UnreadLink() {
  const { t } = useNotificationI18n()
  const resource = useResource<NotificationsResponse>(
    '/api/notifications?limit=1',
  )
  const reload = resource.reload
  useEffect(() => {
    window.addEventListener('focus', reload)
    window.addEventListener(notificationReadEvent, reload)
    return () => {
      window.removeEventListener('focus', reload)
      window.removeEventListener(notificationReadEvent, reload)
    }
  }, [reload])
  const count = resource.data?.unreadCount
  return (
    <Link
      href="/notifications"
      className={styles.inboxLink}
      aria-label={
        count === undefined
          ? t('title')
          : `${t('title')} · ${t('unreadCount', { count })}`
      }
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 14h12l-1.5-2V8a4.5 4.5 0 0 0-9 0v4L4 14Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M8 16a2 2 0 0 0 4 0M10 2V1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <span>{t('title')}</span>
      {count !== undefined && count > 0 && (
        <span className={styles.counter} aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
