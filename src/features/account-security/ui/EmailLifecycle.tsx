'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Locale, User } from '@/shared/api'
import { api, ApiError, useResource } from '@/shared/api'
import { readEmailLink, type EmailLink } from '@/shared/lib/email-link'
import { useI18n } from '@/shared/i18n'
import { BuyerShell } from '@/shared/ui/app-shell'
import { ErrorState, Loading } from '@/shared/ui/feedback'
import { lifecycleMessages } from '../model/lifecycleMessages'
import { authStyles as styles } from '@/shared/ui/auth-layout'

function useLocalizedTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Ostatki`
  }, [title])
}

function useEmailLink() {
  const { setLocale } = useI18n()
  const captured = useRef(false)
  const [link, setLink] = useState<EmailLink | null>(null)
  useEffect(() => {
    if (captured.current) return
    captured.current = true
    const parsed = readEmailLink(window.location.hash)
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    )
    queueMicrotask(() => {
      setLink(parsed)
      if (parsed.locale) setLocale(parsed.locale)
    })
  }, [setLocale])
  return link
}

function requestProblem(error: unknown, locale: Locale) {
  const m = lifecycleMessages[locale]
  if (!(error instanceof ApiError)) return m.failure
  if (error.code === 'MAIL_UNAVAILABLE') return m.mailUnavailable
  if (error.code === 'VERIFY_ACCOUNT_MISMATCH') return m.accountMismatch
  if (error.code === 'INVALID_OR_EXPIRED_TOKEN') return m.invalidLink
  if (error.status === 401) return m.confirmationLogin
  if (error.status === 429) return m.rateLimited
  if (error.status === 0 || error.status >= 500) return m.connection
  return error.status === 400 ? m.invalidEmail : m.failure
}

export function VerificationNotice({ user }: { user: User }) {
  const { locale } = useI18n()
  const m = lifecycleMessages[locale]
  if (user.emailVerified !== false) return null
  return (
    <section className={`notice ${styles.verificationNotice}`}>
      <h2>{m.unverifiedBadge}</h2>
      <p>{m.verifyNotice}</p>
      <Link className="button secondary" href="/verify-email">
        {m.verifyLink}
      </Link>
    </section>
  )
}

export function VerifyEmail() {
  const { locale } = useI18n()
  const m = lifecycleMessages[locale]
  useLocalizedTitle(m.verifyTitle)
  const link = useEmailLink()
  const params = useSearchParams()
  const router = useRouter()
  const session = useResource<{ user: User | null }>('/api/session')
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<
    'sent' | 'confirmed' | 'verified' | null
  >(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [invalidated, setInvalidated] = useState(false)
  const user = session.data?.user
  const invalid =
    link?.status === 'invalid' ||
    invalidated ||
    (failure instanceof ApiError && failure.code === 'INVALID_OR_EXPIRED_TOKEN')
  const mismatch =
    failure instanceof ApiError && failure.code === 'VERIFY_ACCOUNT_MISMATCH'
  const authRequired = failure instanceof ApiError && failure.status === 401
  const tokenReady = link?.status === 'ready' && !invalid

  async function request() {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      const result = await api<{ sent?: boolean; verified?: boolean }>(
        '/api/auth/verification/request',
        { method: 'POST', body: JSON.stringify({ locale }) },
      )
      setSuccess(result.verified ? 'verified' : 'sent')
      if (result.verified) session.reload()
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'INVALID_OR_EXPIRED_TOKEN'
      )
        setInvalidated(true)
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }
  async function confirm() {
    if (busy || !link?.token) return
    setBusy(true)
    setFailure(null)
    try {
      await api('/api/auth/verification/confirm', {
        method: 'POST',
        body: JSON.stringify({ token: link.token }),
      })
      setSuccess('confirmed')
      session.reload()
      router.refresh()
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === 'INVALID_OR_EXPIRED_TOKEN'
      )
        setInvalidated(true)
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }
  async function switchAccount() {
    if (busy) return
    setBusy(true)
    try {
      await api('/api/session', { method: 'DELETE' })
      router.replace('/login?next=/verify-email')
      router.refresh()
    } catch (error) {
      setFailure(error)
      setBusy(false)
    }
  }

  return (
    <BuyerShell title={m.verifyTitle} back="/profile" nav={false}>
      <h2 className={styles.heading}>{m.verifyHeading}</h2>
      {!link || session.loading ? (
        <Loading />
      ) : session.error ? (
        <ErrorState error={session.error} retry={session.reload} />
      ) : success === 'confirmed' ? (
        <>
          <p className={styles.success} role="status">
            {m.confirmSuccess}
          </p>
          <Link className="button" href="/login">
            {m.signIn}
          </Link>
        </>
      ) : tokenReady && !mismatch ? (
        <>
          <p>{m.confirmIntro}</p>
          <p className={styles.help}>{m.reopenLink}</p>
          {!user || authRequired ? (
            <>
              <p className={styles.help}>{m.confirmationLogin}</p>
              <Link className="button" href="/login?next=/verify-email">
                {m.signIn}
              </Link>
            </>
          ) : (
            <>
              <p className={styles.help}>{user.email}</p>
              <button className="button" disabled={busy} onClick={confirm}>
                {m[busy ? 'pending' : 'confirmAction']}
              </button>
            </>
          )}
        </>
      ) : mismatch ? (
        <button className="button" disabled={busy} onClick={switchAccount}>
          {m[busy ? 'pending' : 'switchAccount']}
        </button>
      ) : user?.emailVerified || success === 'verified' ? (
        <>
          <p className={styles.success} role="status">
            {m.alreadyVerified}
          </p>
          <Link className="button" href="/profile">
            {m.profile}
          </Link>
        </>
      ) : (
        <>
          <p>{invalid ? m.invalidLink : m.verifyIntro}</p>
          {user ? (
            <>
              <div className={styles.emailAddress}>
                <span>{m.verifyAddress}</span>
                <strong>{user.email}</strong>
              </div>
              {(success === 'sent' || params.get('delivery') === 'sent') && (
                <p className={styles.success} role="status">
                  {m.verifySent}
                </p>
              )}
              {success === null && params.get('delivery') === 'failed' && (
                <p className={styles.help}>{m.verifyNotSent}</p>
              )}
              <button className="button" disabled={busy} onClick={request}>
                {
                  m[
                    busy
                      ? 'pending'
                      : success === 'sent'
                        ? 'resendVerification'
                        : 'requestVerification'
                  ]
                }
              </button>
            </>
          ) : (
            <>
              <p className={styles.help}>{m.verificationLogin}</p>
              <Link className="button" href="/login?next=/verify-email">
                {m.signIn}
              </Link>
            </>
          )}
        </>
      )}
      {failure !== null && success !== 'confirmed' && (
        <p role="alert" className={styles.error}>
          {requestProblem(failure, locale)}
        </p>
      )}
    </BuyerShell>
  )
}

export function ForgotPassword() {
  const { locale } = useI18n()
  const m = lifecycleMessages[locale]
  useLocalizedTitle(m.forgotTitle)
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const email = String(new FormData(form).get('email') ?? '').trim()
    setBusy(true)
    setFailure(null)
    try {
      await api('/api/auth/password/forgot', {
        method: 'POST',
        body: JSON.stringify({ email, locale }),
      })
      setAccepted(true)
    } catch (error) {
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <BuyerShell title={m.forgotTitle} back="/login" nav={false}>
      <h2 className={styles.heading}>{m.forgotHeading}</h2>
      <p className={styles.help}>{m.forgotIntro}</p>
      <form className={styles.form} onSubmit={submit} aria-busy={busy}>
        <label className={styles.field}>
          <span>{m.email}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            required
            maxLength={254}
            placeholder={m.emailHint}
            disabled={busy}
            onChange={() => {
              setAccepted(false)
              setFailure(null)
            }}
          />
        </label>
        {accepted && (
          <p role="status" className={styles.success}>
            {m.forgotAccepted}
          </p>
        )}
        {failure !== null && (
          <p role="alert" className={styles.error}>
            {requestProblem(failure, locale)}
          </p>
        )}
        <button className="button" disabled={busy} type="submit">
          {m[busy ? 'pending' : accepted ? 'forgotResend' : 'forgotAction']}
        </button>
      </form>
      <Link className={styles.textLink} href="/login">
        {m.backToLogin}
      </Link>
    </BuyerShell>
  )
}

export function ResetPassword() {
  const { locale } = useI18n()
  const m = lifecycleMessages[locale]
  useLocalizedTitle(m.resetTitle)
  const link = useEmailLink()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [validation, setValidation] = useState<
    'passwordMismatch' | 'passwordInvalid' | null
  >(null)
  const invalid =
    link?.status === 'invalid' ||
    (failure instanceof ApiError && failure.code === 'INVALID_OR_EXPIRED_TOKEN')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !link?.token) return
    setFailure(null)
    setValidation(null)
    const fields = new FormData(event.currentTarget)
    const password = String(fields.get('password') ?? '')
    if (password !== fields.get('confirmPassword')) {
      setValidation('passwordMismatch')
      formRef.current
        ?.querySelector<HTMLInputElement>('[name="confirmPassword"]')
        ?.focus()
      return
    }
    if (Array.from(password).length < 15 || Array.from(password).length > 128) {
      setValidation('passwordInvalid')
      return
    }
    setBusy(true)
    try {
      await api('/api/auth/password/reset', {
        method: 'POST',
        body: JSON.stringify({ token: link.token, password }),
      })
      formRef.current?.reset()
      setVisible(false)
      setComplete(true)
      router.refresh()
    } catch (error) {
      setFailure(error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <BuyerShell title={m.resetTitle} back="/login" nav={false}>
      <h2 className={styles.heading}>{m.resetHeading}</h2>
      {!link ? (
        <Loading />
      ) : complete ? (
        <>
          <p className={styles.success} role="status">
            {m.resetSuccess}
          </p>
          <Link className="button" href="/login">
            {m.signIn}
          </Link>
        </>
      ) : link.status === 'missing' || invalid ? (
        <>
          <p className={styles.error} role="alert">
            {m[invalid ? 'invalidLink' : 'missingLink']}
          </p>
          <Link className="button" href="/forgot-password">
            {m.resetAnother}
          </Link>
        </>
      ) : (
        <>
          <p className={styles.help}>{m.resetIntro}</p>
          <form
            className={styles.form}
            ref={formRef}
            onSubmit={submit}
            aria-busy={busy}
          >
            <div className={styles.field}>
              <label htmlFor="reset-password">{m.newPassword}</label>
              <div className={styles.password}>
                <input
                  id="reset-password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  maxLength={256}
                  aria-describedby="reset-password-help"
                  disabled={busy}
                />
                <button
                  className={styles.reveal}
                  type="button"
                  aria-pressed={visible}
                  onClick={() => setVisible((value) => !value)}
                  disabled={busy}
                >
                  {m[visible ? 'hide' : 'show']}
                </button>
              </div>
            </div>
            <p id="reset-password-help" className={styles.help}>
              {m.passwordHint}
            </p>
            <label className={styles.field}>
              <span>{m.repeatPassword}</span>
              <input
                name="confirmPassword"
                type={visible ? 'text' : 'password'}
                autoComplete="new-password"
                required
                maxLength={256}
                disabled={busy}
              />
            </label>
            {validation && (
              <p className={styles.error} role="alert">
                {m[validation]}
              </p>
            )}
            {failure !== null && (
              <p className={styles.error} role="alert">
                {requestProblem(failure, locale)}
              </p>
            )}
            <button className="button" type="submit" disabled={busy}>
              {m[busy ? 'pending' : 'resetAction']}
            </button>
          </form>
          <p className={styles.help}>{m.reopenLink}</p>
        </>
      )}
    </BuyerShell>
  )
}
