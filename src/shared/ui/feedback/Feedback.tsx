'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ApiError } from '@/shared/api'
import { useI18n } from '@/shared/i18n'

export function Loading() {
  const { t } = useI18n()
  return (
    <div role="status" className="loading-state">
      <div className="skeleton" />
      <div className="skeleton short" />
      <p>{t('loading')}</p>
    </div>
  )
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  const { t, errorText } = useI18n()
  const pathname = usePathname()
  return (
    <div className="notice danger" role="alert">
      <p>{errorText(error)}</p>
      {error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED' ? (
        <Link className="button" href="/verify-email">
          {t('verifyEmail')}
        </Link>
      ) : error instanceof ApiError && error.status === 401 ? (
        <Link
          className="button"
          href={`/login?next=${encodeURIComponent(pathname)}`}
        >
          {t('signIn')}
        </Link>
      ) : (
        <button className="button secondary" onClick={retry}>
          {t('retry')}
        </button>
      )}
    </div>
  )
}
export function BuyerLoginNotice({ returnTo = '/' }: { returnTo?: string }) {
  const { t } = useI18n()
  return (
    <section className="notice">
      <h2>{t('loginNeeded')}</h2>
      <p>{t('signInHint')}</p>
      <Link
        className="button"
        href={`/login?next=${encodeURIComponent(returnTo)}`}
      >
        {t('signIn')}
      </Link>
    </section>
  )
}
