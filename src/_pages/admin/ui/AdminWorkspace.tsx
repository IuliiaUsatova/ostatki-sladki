'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type {
  AdminVenuesResponse,
  Locale,
  ModerationAction,
  User,
  VenueApplicationResponse,
  VenueStatus,
} from '@/shared/api'
import { api, ApiError, useResource } from '@/shared/api'
import { LanguageSwitcher } from '@/shared/ui/language-switcher'
import { VerificationNotice } from '@/features/account-security'
import {
  useAdminI18n,
  ApplicationStatus,
  ApplicationHistory,
} from '@/entities/venue'
import { VenueProfileReview } from '@/entities/venue'
import { adminStyles as styles } from '@/shared/ui/admin-layout'

const statuses: VenueStatus[] = [
  'pending',
  'changes_requested',
  'approved',
  'rejected',
  'suspended',
]
const languages: Record<Locale, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}

export default function AdminWorkspace() {
  const { t } = useAdminI18n()
  const session = useResource<{ user: User | null }>('/api/session')
  const reloadSession = session.reload
  useEffect(() => {
    window.addEventListener('focus', reloadSession)
    return () => window.removeEventListener('focus', reloadSession)
  }, [reloadSession])
  if (session.loading)
    return (
      <AccessGate>
        <p role="status">{t('loading')}</p>
      </AccessGate>
    )
  if (!session.data?.user || session.data.user.role !== 'admin')
    return (
      <AccessGate>
        <h1>{t('gate')}</h1>
        <p>{t(session.data?.user ? 'denied' : 'gateText')}</p>
        <Link
          href={session.data?.user ? '/profile' : '/login?next=/admin'}
          className={styles.primary}
        >
          {t(session.data?.user ? 'profile' : 'login')}
        </Link>
        {session.error !== null && (
          <button className={styles.secondary} onClick={session.reload}>
            {t('retry')}
          </button>
        )}
      </AccessGate>
    )
  if (session.data.user.emailVerified === false)
    return (
      <AccessGate>
        <h1>{t('workspace')}</h1>
        <VerificationNotice user={session.data.user} />
        <Link href="/profile" className={styles.secondary}>
          {t('profile')}
        </Link>
      </AccessGate>
    )
  return <ReviewWorkspace user={session.data.user} />
}

function AccessGate({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.gate}>
      <section className={styles.gatePanel}>
        <LanguageSwitcher />
        {children}
      </section>
    </div>
  )
}

function ReviewWorkspace({ user }: { user: User }) {
  const { t, error } = useAdminI18n()
  const resource = useResource<AdminVenuesResponse>('/api/admin/venues')
  const [filter, setFilter] = useState<VenueStatus | 'all'>('pending')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detailRefresh, setDetailRefresh] = useState(0)
  const venues = resource.data?.venues ?? []
  const rows = venues.filter(
    (venue) =>
      (filter === 'all' || venue.status === filter) &&
      `${venue.name} ${venue.address} ${venue.owner.name} ${venue.owner.email ?? ''}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  )
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          {t('brand')}
        </Link>
        <p className={styles.eyebrow}>{t('workspace')}</p>
        <div className={styles.identity}>
          <strong>{user.name}</strong>
          <span>{user.email}</span>
        </div>
        <LanguageSwitcher />
        <nav className={styles.navigation} aria-label={t('queue')}>
          <p>{t('queue')}</p>
          {(['all', ...statuses] as const).map((status) => (
            <button
              key={status}
              aria-pressed={filter === status}
              onClick={() => setFilter(status)}
            >
              <span>{t(status)}</span>
              <span>
                {
                  venues.filter(
                    (venue) => status === 'all' || venue.status === status,
                  ).length
                }
              </span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <Link href="/admin/support">{t('support')}</Link>
          <Link href="/profile">{t('profile')}</Link>
          <Link href="/">{t('buyerApp')}</Link>
        </div>
      </aside>
      <main className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <h1>{t('title')}</h1>
            <p>{t('subtitle')}</p>
          </div>
          <button
            className={styles.secondary}
            onClick={() => {
              resource.reload()
              setDetailRefresh((value) => value + 1)
            }}
          >
            {t('retry')}
          </button>
        </header>
        <div className={styles.summary}>
          <Summary
            title={t('summary')}
            count={venues.filter((venue) => venue.status === 'pending').length}
            hint={t('summaryHint')}
          />
          <Summary
            title={t('active')}
            count={venues.filter((venue) => venue.status === 'approved').length}
            hint={t('activeHint')}
          />
          <Summary
            title={t('changed')}
            count={
              venues.filter((venue) =>
                ['changes_requested', 'rejected'].includes(venue.status),
              ).length
            }
            hint={t('changedHint')}
          />
        </div>
        {resource.error !== null && (
          <div className={styles.error} role="alert">
            {error(resource.error)}
          </div>
        )}
        <div
          className={styles.reviewLayout}
          data-selected={selected ? 'true' : 'false'}
        >
          <section className={styles.queue} aria-label={t('queue')}>
            <label className={styles.search}>
              <span className={styles.srOnly}>{t('search')}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('search')}
              />
            </label>
            <div className={styles.queueHeading}>
              <h2>{t(filter)}</h2>
              <span>{rows.length}</span>
            </div>
            {resource.loading ? (
              <p className={styles.empty} role="status">
                {t('loading')}
              </p>
            ) : !rows.length ? (
              <p className={styles.empty}>{t('empty')}</p>
            ) : (
              <ul className={styles.queueList}>
                {rows.map((venue) => (
                  <li key={venue.id}>
                    <button
                      className={styles.applicationRow}
                      aria-pressed={selected === venue.id}
                      onClick={() => setSelected(venue.id)}
                    >
                      <div className={styles.rowTop}>
                        <strong>{venue.name}</strong>
                        <ApplicationStatus status={venue.status} />
                      </div>
                      <span className={styles.address}>{venue.address}</span>
                      <span className={styles.rowFooter}>
                        {venue.owner.name}{' '}
                        <span>
                          {t('revision')} {venue.revision}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={styles.detail} aria-label={t('details')}>
            {selected ? (
              <ApplicationReview
                key={`${selected}:${detailRefresh}`}
                id={selected}
                onBack={() => setSelected(null)}
                onSaved={resource.reload}
              />
            ) : (
              <div className={styles.emptySelection}>
                <div className={styles.emptyMark} aria-hidden="true">
                  /
                </div>
                <h2>{t('choose')}</h2>
                <p>{t('chooseText')}</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function Summary({
  title,
  count,
  hint,
}: {
  title: string
  count: number
  hint: string
}) {
  return (
    <div className={styles.summaryItem}>
      <span>{title}</span>
      <strong>{count}</strong>
      <small>{hint}</small>
    </div>
  )
}

function ApplicationReview({
  id,
  onSaved,
  onBack,
}: {
  id: string
  onSaved: () => void
  onBack: () => void
}) {
  const { t, locale, when, error } = useAdminI18n()
  const resource = useResource<VenueApplicationResponse>(
    `/api/admin/venues/${encodeURIComponent(id)}`,
  )
  const dialog = useRef<HTMLDialogElement>(null)
  const [decision, setDecision] = useState<{
    action: ModerationAction
    revision: number
  } | null>(null)
  const [reasons, setReasons] = useState<Record<Locale, string>>({
    ru: '',
    kk: '',
    en: '',
  })
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [formError, setFormError] = useState(false)
  const [success, setSuccess] = useState(false)
  const application = resource.data?.application
  const refresh = () => {
    dialog.current?.close()
    setSuccess(false)
    resource.reload()
    onSaved()
  }
  function open(action: ModerationAction) {
    if (!application) return
    setDecision({ action, revision: application.revision })
    setReasons({ ru: '', kk: '', en: '' })
    setChecked(false)
    setFailure(null)
    setFormError(false)
    dialog.current?.showModal()
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !decision || !checked) return
    const requiredReasons = decision.action !== 'approve'
    if (
      requiredReasons &&
      Object.values(reasons).some((value) => !value.trim())
    ) {
      setFormError(true)
      return
    }
    setBusy(true)
    setFailure(null)
    setFormError(false)
    try {
      await api<VenueApplicationResponse>(
        `/api/admin/venues/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            action: decision.action,
            expectedRevision: decision.revision,
            ...(requiredReasons ? { reasons } : {}),
          }),
        },
      )
      dialog.current?.close()
      setSuccess(true)
      resource.reload()
      onSaved()
    } catch (value) {
      setFailure(value)
    } finally {
      setBusy(false)
    }
  }
  const needsReload =
    failure instanceof ApiError &&
    (['MODERATION_CONFLICT', 'MODERATION_STATE_CONFLICT'].includes(
      failure.code,
    ) ||
      failure.status === 0 ||
      failure.status >= 500)
  return (
    <>
      <button className={styles.back} onClick={onBack}>
        {t('back')}
      </button>
      {resource.loading ? (
        <p role="status">{t('loading')}</p>
      ) : !application ? (
        <div className={styles.error} role="alert">
          <p>{error(resource.error)}</p>
          <button className={styles.secondary} onClick={resource.reload}>
            {t('retry')}
          </button>
        </div>
      ) : (
        <>
          <header className={styles.detailHeading}>
            <div>
              <ApplicationStatus status={application.status} />
              <h2>{application.name}</h2>
              <p>{application.address}</p>
            </div>
            <button className={styles.textButton} onClick={refresh}>
              {t('retry')}
            </button>
          </header>
          {success && (
            <div className={styles.success} role="status">
              {t('success')}
            </div>
          )}
          <dl className={styles.applicationData}>
            <div className={styles.wide}>
              <dt>{t('description')}</dt>
              <dd>{application.description || t('noDescription')}</dd>
            </div>
            <div>
              <dt>{t('owner')}</dt>
              <dd>{application.owner.name}</dd>
            </div>
            <div>
              <dt>{t('email')}</dt>
              <dd>{application.owner.email ?? '—'}</dd>
            </div>
            <div>
              <dt>{t('phone')}</dt>
              <dd>{application.contactPhone || t('noPhone')}</dd>
            </div>
            <div>
              <dt>{t('revision')}</dt>
              <dd>{application.revision}</dd>
            </div>
            <div>
              <dt>{t('submitted')}</dt>
              <dd>{when(application.submittedAt)}</dd>
            </div>
            <div>
              <dt>{t('updated')}</dt>
              <dd>{when(application.updatedAt)}</dd>
            </div>
          </dl>
          <VenueProfileReview
            profile={application.profile}
            timezone={application.timezone}
            photos={application.photos}
          />
          {application.reasons && (
            <aside className={styles.reviewReason}>
              <h3>{t('reason')}</h3>
              <p>{application.reasons[locale]}</p>
            </aside>
          )}
          <div className={styles.decisionActions}>
            {application.status === 'pending' && (
              <button
                className={styles.primary}
                onClick={() => open('approve')}
              >
                {t('approve')}
              </button>
            )}
            {application.status === 'pending' && (
              <button
                className={styles.secondary}
                onClick={() => open('request_changes')}
              >
                {t('request_changes')}
              </button>
            )}
            {application.status === 'pending' && (
              <button className={styles.danger} onClick={() => open('reject')}>
                {t('reject')}
              </button>
            )}
            {application.status === 'approved' && (
              <button className={styles.danger} onClick={() => open('suspend')}>
                {t('suspend')}
              </button>
            )}
          </div>
          {!['pending', 'approved'].includes(application.status) && (
            <p className={styles.muted}>{t('awaitingResubmission')}</p>
          )}
          <ApplicationHistory application={application} />
        </>
      )}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="moderation-confirm-title"
        onCancel={(event) => {
          if (busy) event.preventDefault()
        }}
      >
        <form onSubmit={submit} className={styles.dialogContent}>
          <p className={styles.eyebrow}>{t('confirmation')}</p>
          <h2 id="moderation-confirm-title">
            {t(decision?.action ?? 'confirm')} · {application?.name}
          </h2>
          <p>{t(`${decision?.action ?? 'approve'}Help`)}</p>
          {decision && decision.action !== 'approve' && (
            <fieldset
              className={styles.reasonFields}
              disabled={busy || needsReload}
            >
              <legend>{t('reason')}</legend>
              <p className={styles.muted}>{t('translationHelp')}</p>
              {(['ru', 'kk', 'en'] as Locale[]).map((language) => (
                <label className={styles.field} key={language}>
                  {languages[language]}
                  <textarea
                    required
                    maxLength={1500}
                    value={reasons[language]}
                    onChange={(event) =>
                      setReasons((current) => ({
                        ...current,
                        [language]: event.target.value,
                      }))
                    }
                    lang={language}
                  />
                </label>
              ))}
            </fieldset>
          )}
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={checked}
              disabled={busy || needsReload}
              onChange={(event) => setChecked(event.target.checked)}
            />
            {t('checked')}
          </label>
          {formError && (
            <p className={styles.error} role="alert">
              {t('reasonsRequired')}
            </p>
          )}
          {failure !== null && (
            <div className={styles.error} role="alert">
              {error(failure)}
            </div>
          )}
          <div className={styles.decisionActions}>
            {needsReload ? (
              <button
                className={styles.primary}
                type="button"
                onClick={refresh}
              >
                {t('retry')}
              </button>
            ) : (
              <button
                className={
                  decision?.action === 'approve'
                    ? styles.primary
                    : styles.danger
                }
                disabled={busy || !checked}
                type="submit"
              >
                {t(busy ? 'busy' : 'confirm')}
              </button>
            )}
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              {t('cancel')}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
