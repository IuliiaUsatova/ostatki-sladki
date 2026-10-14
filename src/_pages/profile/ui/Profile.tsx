'use client'

import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Order, User } from '@/shared/api'
import { api, useResource } from '@/shared/api'
import { emailPreferencesPath } from '@/shared/lib/auth-routing'
import {
  emailPreferencesAnchorSnapshot,
  profileAnchorServerSnapshot,
  subscribeProfileAnchor,
} from '@/shared/lib/profile-anchor'
import { useI18n } from '@/shared/i18n'
import { BuyerShell } from '@/shared/ui/app-shell'
import { ErrorState, Loading } from '@/shared/ui/feedback'
import { LanguageSwitcher } from '@/shared/ui/language-switcher'
import { VerificationNotice } from '@/features/account-security'
import { lifecycleMessages } from '@/features/account-security'
import { UnreadLink } from '@/entities/notification'
import { Preferences } from '@/features/notification-preferences'

export default function Profile() {
  const { t, errorText, locale } = useI18n()
  const session = useResource<{ user: User | null }>('/api/session')
  const emailPreferencesAnchor = useSyncExternalStore(
    subscribeProfileAnchor,
    emailPreferencesAnchorSnapshot,
    profileAnchorServerSnapshot,
  )
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  async function logout() {
    setBusy(true)
    setFailure(null)
    try {
      await api('/api/session', { method: 'DELETE' })
      session.reload()
    } catch (error) {
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }
  const user = session.data?.user
  useEffect(() => {
    // The anchor section appears only after the asynchronous session check.
    if (user?.id && emailPreferencesAnchor) {
      const section = document.getElementById('email-updates')
      section?.focus({ preventScroll: true })
      section?.scrollIntoView({ block: 'start' })
    }
  }, [user?.id, emailPreferencesAnchor])
  return (
    <BuyerShell title={t('profile')}>
      {session.loading ? (
        <Loading />
      ) : session.error ? (
        <ErrorState error={session.error} retry={session.reload} />
      ) : (
        <>
          <h2 className="profile-name">{user?.name ?? t('guest')}</h2>
          {user ? (
            <>
              <p className="small profile-email">{user.email}</p>
              <span className="badge">
                {t(user.role === 'admin' ? 'admin' : user.role)}
              </span>
              {user.emailVerified && (
                <span className="badge">
                  {lifecycleMessages[locale].verifiedBadge}
                </span>
              )}
              <VerificationNotice user={user} />
              <UnreadLink key={`inbox:${user.id}`} />
              <Preferences key={`preferences:${user.id}`} user={user} />
              {user.role === 'buyer' && <BuyerStats key={user.id} />}
              {['cafe', 'pickup'].includes(user.role) && (
                <Link className="button secondary" href="/merchant">
                  {t('openMerchant')}
                </Link>
              )}
              {user.role === 'admin' && (
                <Link className="button" href="/admin">
                  {t('openAdmin')}
                </Link>
              )}
            </>
          ) : (
            <>
              <p className="small">{t('guestHint')}</p>
              <Link
                className="button"
                href={
                  emailPreferencesAnchor
                    ? '/login?next=' + encodeURIComponent(emailPreferencesPath)
                    : '/login'
                }
              >
                {t('signIn')}
              </Link>
              <Link className="button secondary" href="/register">
                {t('register')}
              </Link>
            </>
          )}
          {failure !== null && (
            <div role="alert" className="notice danger">
              <p>{errorText(failure)}</p>
            </div>
          )}
          <div className="detail-row">
            <h2 className="section-title">{t('language')}</h2>
            <LanguageSwitcher />
          </div>
          <p className="small">{t('languageHint')}</p>
          {user && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={logout}
            >
              {t('logout')}
            </button>
          )}
        </>
      )}
    </BuyerShell>
  )
}

function BuyerStats() {
  const { t, formatMoney } = useI18n()
  const { data } = useResource<{ orders: Order[] }>('/api/orders')
  if (!data) return null
  const savings = data.orders
    .filter((order) => order.status === 'collected')
    .reduce(
      (sum, order) =>
        sum +
        (order.snapshot.originalPrice - order.snapshot.price) * order.quantity,
      0,
    )
  return (
    <section className="notice">
      <h2>
        {data.orders.length} {t('orderCount')}
      </h2>
      <p>
        {formatMoney(savings)} {t('savings')}
      </p>
    </section>
  )
}
