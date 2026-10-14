'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type {
  Locale,
  NotificationPreferences,
  NotificationPreferencesResponse,
  User,
} from '@/shared/api'
import { api, ApiError, useResource } from '@/shared/api'
import { ErrorState } from '@/shared/ui/feedback'
import { useNotificationI18n } from '@/entities/notification'
import { notificationsStyles as styles } from '@/shared/ui/notification-layout'

const languageNames: Record<Locale, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}

export default function Preferences({ user }: { user: User }) {
  const { t } = useNotificationI18n()
  const resource = useResource<NotificationPreferencesResponse>(
    '/api/notification-preferences',
  )
  return (
    <section
      className={styles.panel}
      id="email-updates"
      tabIndex={-1}
      aria-label={t('preferences')}
    >
      <h2>{t('preferences')}</h2>
      <p className={styles.intro}>{t('preferencesIntro')}</p>
      {resource.loading ? (
        <p role="status">{t('loading')}</p>
      ) : resource.error ? (
        <ErrorState error={resource.error} retry={resource.reload} />
      ) : (
        resource.data && (
          <PreferencesForm
            key={user.id}
            user={user}
            initial={resource.data.preferences}
          />
        )
      )}
    </section>
  )
}

function PreferencesForm({
  user,
  initial,
}: {
  user: User
  initial: NotificationPreferences
}) {
  const { t, errorText } = useNotificationI18n()
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [complete, setComplete] = useState(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const unknown =
    failure instanceof ApiError &&
    (failure.status === 0 || failure.status >= 500)
  const changed =
    draft.emailEnabled !== saved.emailEnabled || draft.locale !== saved.locale
  const emailEligible = user.role === 'buyer' || user.role === 'cafe'
  function update(patch: Partial<NotificationPreferences>) {
    setDraft((previous) => ({ ...previous, ...patch }))
    setComplete(false)
    setFailure(null)
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      busy ||
      unknown ||
      !changed ||
      (draft.emailEnabled && (user.emailVerified !== true || !emailEligible))
    )
      return
    setBusy(true)
    setFailure(null)
    const requestController = new AbortController()
    controller.current = requestController
    try {
      const result = await api<NotificationPreferencesResponse>(
        '/api/notification-preferences',
        {
          method: 'PATCH',
          body: JSON.stringify(draft),
          signal: requestController.signal,
        },
      )
      if (requestController.signal.aborted) return
      setSaved(result.preferences)
      setDraft(result.preferences)
      setComplete(true)
    } catch (error) {
      if (!requestController.signal.aborted) setFailure(error)
    } finally {
      if (!requestController.signal.aborted) setBusy(false)
    }
  }
  async function reload() {
    if (busy) return
    setBusy(true)
    const requestController = new AbortController()
    controller.current = requestController
    try {
      const result = await api<NotificationPreferencesResponse>(
        '/api/notification-preferences',
        { signal: requestController.signal },
      )
      if (requestController.signal.aborted) return
      setSaved(result.preferences)
      setDraft(result.preferences)
      setFailure(null)
      setComplete(false)
    } catch (error) {
      if (!requestController.signal.aborted) setFailure(error)
    } finally {
      if (!requestController.signal.aborted) setBusy(false)
    }
  }
  return (
    <form className={styles.form} onSubmit={submit} aria-busy={busy}>
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={draft.emailEnabled}
          disabled={
            busy ||
            unknown ||
            (!draft.emailEnabled &&
              (user.emailVerified !== true || !emailEligible))
          }
          onChange={(event) => update({ emailEnabled: event.target.checked })}
        />
        {t('emailEnabled')}
      </label>
      <label className={styles.field}>
        {t('emailLocale')}
        <select
          value={draft.locale}
          disabled={busy || unknown}
          onChange={(event) => update({ locale: event.target.value as Locale })}
        >
          {(['ru', 'kk', 'en'] as Locale[]).map((locale) => (
            <option key={locale} value={locale}>
              {languageNames[locale]}
            </option>
          ))}
        </select>
        <span className={styles.hint}>{t('localeHint')}</span>
      </label>
      {user.emailVerified !== true && (
        <div className={styles.notice}>
          <p>{t('verifiedNeeded')}</p>
          <Link className={styles.settingsLink} href="/verify-email">
            {t('verifyEmail')}
          </Link>
        </div>
      )}
      {!emailEligible && <p className={styles.hint}>{t('emailRoleHint')}</p>}
      <p className={styles.hint}>{t('preferencesDeliveryHint')}</p>
      {complete && (
        <p className={styles.success} role="status">
          {t('preferencesSaved')}
        </p>
      )}
      {failure !== null && (
        <p className={styles.error} role="alert">
          {unknown ? t('preferencesUnknown') : errorText(failure)}
        </p>
      )}
      {unknown ? (
        <button
          className={styles.secondary}
          type="button"
          disabled={busy}
          onClick={reload}
        >
          {t(busy ? 'working' : 'reloadPreferences')}
        </button>
      ) : (
        <button
          className={styles.primary}
          type="submit"
          disabled={
            busy ||
            !changed ||
            (draft.emailEnabled &&
              (user.emailVerified !== true || !emailEligible))
          }
        >
          {t(busy ? 'working' : 'savePreferences')}
        </button>
      )}
    </form>
  )
}
