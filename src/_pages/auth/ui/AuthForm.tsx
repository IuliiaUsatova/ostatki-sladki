'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import type { User } from '@/shared/api'
import { api, ApiError, useResource } from '@/shared/api'
import {
  authDestination,
  emailPreferencesPath,
} from '@/shared/lib/auth-routing'
import { useI18n } from '@/shared/i18n'
import { BuyerShell } from '@/shared/ui/app-shell'
import { ErrorState, Loading } from '@/shared/ui/feedback'
import { authMessages } from '../model/messages'
import { lifecycleMessages } from '@/features/account-security'
import { authStyles as styles } from '@/shared/ui/auth-layout'

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { locale, setLocale } = useI18n()
  const m = authMessages[locale]
  const router = useRouter()
  const params = useSearchParams()
  const session = useResource<{ user: User | null }>('/api/session')
  const [accountType, setAccountType] = useState<'buyer' | 'cafe'>('buyer')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [complete, setComplete] = useState<User | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const register = mode === 'register'
  const next = params.get('next')
  const switchUrl = `${register ? '/login' : '/register'}${next ? `?next=${encodeURIComponent(next)}` : ''}`

  function problem(error: unknown) {
    if (!(error instanceof ApiError)) return m.failure
    if (error.code === 'INVALID_CREDENTIALS') return m.invalidCredentials
    if (
      [
        'EMAIL_UNAVAILABLE',
        'EMAIL_TAKEN',
        'EMAIL_EXISTS',
        'ACCOUNT_EXISTS',
      ].includes(error.code)
    )
      return m.emailTaken
    if (error.status === 429) return m.rateLimited
    if (error.status === 0 || error.status >= 500) return m.connection
    if (error.status === 400) return m.invalid
    return m.failure
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setFailure(null)
    const form = event.currentTarget
    const fields = new FormData(form)
    const password = String(fields.get('password') ?? '')
    if (register && password !== fields.get('confirmPassword')) {
      setFailure(m.passwordMismatch)
      form.querySelector<HTMLInputElement>('[name="confirmPassword"]')?.focus()
      return
    }
    if (
      register &&
      (Array.from(password).length < 15 || Array.from(password).length > 128)
    ) {
      setFailure(m.invalid)
      return
    }
    setBusy(true)
    try {
      const body = {
        email: String(fields.get('email') ?? '').trim(),
        password,
        ...(register
          ? {
              name: String(fields.get('name') ?? '').trim(),
              locale,
              accountType,
              ...(accountType === 'cafe'
                ? {
                    venue: {
                      name: String(fields.get('venueName') ?? '').trim(),
                      address: String(fields.get('address') ?? '').trim(),
                      description: String(
                        fields.get('description') ?? '',
                      ).trim(),
                      contactPhone: String(
                        fields.get('contactPhone') ?? '',
                      ).trim(),
                    },
                  }
                : {}),
            }
          : {}),
      }
      const result = await api<{ user: User; verificationEmailSent?: boolean }>(
        `/api/auth/${register ? 'register' : 'login'}`,
        { method: 'POST', body: JSON.stringify(body) },
      )
      formRef.current?.reset()
      setComplete(result.user)
      if (result.user.locale) setLocale(result.user.locale)
      const destination = register
        ? `/verify-email?delivery=${result.verificationEmailSent ? 'sent' : 'failed'}`
        : authDestination(result.user, next)
      if (destination === emailPreferencesPath)
        window.location.replace(destination)
      else {
        router.replace(destination)
        router.refresh()
      }
    } catch (error) {
      setFailure(problem(error))
    } finally {
      setBusy(false)
    }
  }
  async function logout() {
    setBusy(true)
    setFailure(null)
    try {
      await api('/api/session', { method: 'DELETE' })
      setComplete(null)
      session.reload()
    } catch (error) {
      setFailure(problem(error))
    } finally {
      setBusy(false)
    }
  }
  const currentUser = complete ?? session.data?.user
  return (
    <BuyerShell
      title={m[register ? 'registerTitle' : 'loginTitle']}
      back={register ? '/login' : '/'}
      nav={false}
    >
      {session.loading ? (
        <Loading />
      ) : session.error ? (
        <ErrorState error={session.error} retry={session.reload} />
      ) : currentUser ? (
        <>
          <h2 className={styles.heading}>{currentUser.name}</h2>
          <p className={styles.help}>{m.signedIn}</p>
          <Link className="button" href={authDestination(currentUser, next)}>
            {m.continue}
          </Link>
          <button className="button secondary" disabled={busy} onClick={logout}>
            {m.signOut}
          </button>
          {failure && (
            <p role="alert" className={styles.error}>
              {failure}
            </p>
          )}
        </>
      ) : (
        <>
          {!register && (
            <img
              className={styles.hero}
              src="/images/croissant.png"
              width="362"
              height="210"
              alt=""
            />
          )}
          <h2 className={styles.heading}>
            {m[register ? 'registerHeading' : 'loginHeading']}
          </h2>
          <form
            className={styles.form}
            onSubmit={submit}
            ref={formRef}
            aria-busy={busy}
          >
            {register && (
              <>
                <fieldset className={styles.roles} disabled={busy}>
                  <legend>{m.accountType}</legend>
                  {(['buyer', 'cafe'] as const).map((type) => (
                    <label key={type}>
                      <input
                        type="radio"
                        name="accountType"
                        value={type}
                        checked={accountType === type}
                        onChange={() => setAccountType(type)}
                      />
                      <span>{m[type]}</span>
                    </label>
                  ))}
                </fieldset>
                <p className={styles.help}>
                  {m[accountType === 'buyer' ? 'buyerHint' : 'cafeHint']}
                </p>
                <label className={styles.field}>
                  <span>{m.name}</span>
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder={m.nameHint}
                    disabled={busy}
                  />
                </label>
              </>
            )}
            <label className={styles.field}>
              <span>{m.email}</span>
              <input
                name="email"
                type="email"
                autoComplete={register ? 'email' : 'username'}
                inputMode="email"
                autoCapitalize="none"
                required
                maxLength={254}
                placeholder={m.emailHint}
                disabled={busy}
              />
            </label>
            <div className={styles.field}>
              <label htmlFor="auth-password">{m.password}</label>
              <div className={styles.password}>
                <input
                  id="auth-password"
                  name="password"
                  type={visible ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  required
                  maxLength={256}
                  disabled={busy}
                  aria-describedby={register ? 'password-help' : undefined}
                />
                <button
                  className={styles.reveal}
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-pressed={visible}
                  disabled={busy}
                >
                  {m[visible ? 'hide' : 'show']}
                </button>
              </div>
            </div>
            {register && (
              <>
                <p className={styles.help} id="password-help">
                  {m.passwordHint}
                </p>
                <label className={styles.field}>
                  <span>{m.confirmPassword}</span>
                  <input
                    name="confirmPassword"
                    type={visible ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    maxLength={256}
                    disabled={busy}
                  />
                </label>
              </>
            )}
            {!register && (
              <Link className={styles.textLink} href="/forgot-password">
                {lifecycleMessages[locale].forgotLink}
              </Link>
            )}
            {register && accountType === 'cafe' && (
              <section className={styles.section}>
                <h2>{m.venueSection}</h2>
                <label className={styles.field}>
                  <span>{m.venueName}</span>
                  <input
                    name="venueName"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="organization"
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>{m.address}</span>
                  <input
                    name="address"
                    required
                    minLength={5}
                    maxLength={300}
                    autoComplete="street-address"
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>{m.description}</span>
                  <textarea
                    name="description"
                    required
                    minLength={20}
                    maxLength={1500}
                    placeholder={m.descriptionHint}
                    disabled={busy}
                  />
                </label>
                <label className={styles.field}>
                  <span>{m.phone}</span>
                  <input
                    name="contactPhone"
                    type="tel"
                    required
                    minLength={7}
                    maxLength={30}
                    autoComplete="tel"
                    placeholder={m.phoneHint}
                    disabled={busy}
                  />
                </label>
              </section>
            )}
            {failure && (
              <p role="alert" className={styles.error}>
                {failure}
              </p>
            )}
            <button type="submit" className="button" disabled={busy}>
              {
                m[
                  busy ? 'pending' : register ? 'submitRegister' : 'submitLogin'
                ]
              }
            </button>
          </form>
          <p className={styles.footer}>
            {m[register ? 'haveAccount' : 'noAccount']}{' '}
            <Link href={switchUrl}>{m[register ? 'login' : 'register']}</Link>
          </p>
        </>
      )}
    </BuyerShell>
  )
}
