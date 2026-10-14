'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type {
  AdminSupportQueueResponse,
  SupportStatus,
  User,
} from '@/shared/api'
import { api, useResource } from '@/shared/api'
import { supportCasePath } from '@/shared/lib/auth-routing'
import { LanguageSwitcher } from '@/shared/ui/language-switcher'
import { VerificationNotice } from '@/features/account-security'
import CaseDetail from './CaseDetail'
import { CaseStatus } from '@/entities/support-case'
import { useSupportI18n } from '../model/i18n'
import styles from './support.module.css'

const statuses: SupportStatus[] = ['new', 'in_review', 'waiting', 'resolved']
function selectedCase(values: string[]): string | null {
  return values.length === 1 && supportCasePath(values[0]) !== '/admin/support'
    ? values[0]
    : null
}

export default function SupportWorkspace() {
  const { t, error } = useSupportI18n()
  const params = useSearchParams()
  const returnPath = supportCasePath(selectedCase(params.getAll('case')))
  const session = useResource<{ user: User | null }>('/api/session')
  const reloadSession = session.reload
  useEffect(() => {
    window.addEventListener('focus', reloadSession)
    return () => window.removeEventListener('focus', reloadSession)
  }, [reloadSession])
  const user = session.data?.user
  if (session.loading)
    return (
      <Gate>
        <p role="status">{t('loading')}</p>
      </Gate>
    )
  if (!user || user.role !== 'admin')
    return (
      <Gate>
        <h1>{t('gate')}</h1>
        <p>{t(user ? 'denied' : 'gateHint')}</p>
        {session.error !== null && <p role="alert">{error(session.error)}</p>}
        <Link
          className={styles.primary}
          href={
            user ? '/profile' : `/login?next=${encodeURIComponent(returnPath)}`
          }
        >
          {t(user ? 'profile' : 'signIn')}
        </Link>
        {session.error !== null && (
          <button className={styles.secondary} onClick={reloadSession}>
            {t('refresh')}
          </button>
        )}
      </Gate>
    )
  if (user.emailVerified !== true)
    return (
      <Gate>
        <h1>{t('gate')}</h1>
        <VerificationNotice user={user} />
        <Link className={styles.secondary} href="/profile">
          {t('profile')}
        </Link>
      </Gate>
    )
  return <Workspace key={user.id} user={user} />
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.gate}>
      <section className={styles.gatePanel}>
        <LanguageSwitcher />
        {children}
      </section>
    </div>
  )
}

function Workspace({ user }: { user: User }) {
  const { t } = useSupportI18n()
  const params = useSearchParams()
  const router = useRouter()
  const selected = selectedCase(params.getAll('case'))
  const [status, setStatus] = useState<SupportStatus | 'all'>('all')
  const [kind, setKind] = useState('all')
  const [assignment, setAssignment] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [counts, setCounts] = useState<
    AdminSupportQueueResponse['counts'] | null
  >(null)
  const [queueRefresh, setQueueRefresh] = useState(0)
  const [detailRefresh, setDetailRefresh] = useState(0)
  const queueQuery = new URLSearchParams({
    status,
    kind,
    assignment,
    limit: '20',
    ...(query ? { search: query } : {}),
  }).toString()
  const reload = () => {
    setQueueRefresh((value) => value + 1)
    setDetailRefresh((value) => value + 1)
  }
  const select = (id: string | null) =>
    router.replace(supportCasePath(id), { scroll: false })
  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setQuery(search.trim())
    setQueueRefresh((value) => value + 1)
  }
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}>
          {t('brand')}
        </Link>
        <p className={styles.eyebrow}>{t('workspace')}</p>
        <div className={styles.identity}>
          <strong>{user.name}</strong>
        </div>
        <LanguageSwitcher />
        <nav className={styles.navigation} aria-label={t('workspace')}>
          <Link href="/admin/support" aria-current="page">
            {t('title')}
          </Link>
          <Link href="/admin">{t('moderation')}</Link>
        </nav>
        <div className={styles.sidebarBottom}>
          <Link href="/profile">{t('profile')}</Link>
          <Link href="/">{t('buyerApp')}</Link>
        </div>
      </aside>
      <main className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <h1>{t('title')}</h1>
            <p>{t('intro')}</p>
          </div>
          <button className={styles.secondary} onClick={reload}>
            {t('refresh')}
          </button>
        </header>
        <section
          aria-label={t('globalCounts')}
          className={styles.globalSummary}
        >
          <p>{t('globalCounts')}</p>
          <div className={styles.statusRail}>
            {statuses.map((item) => (
              <button
                key={item}
                aria-pressed={status === item}
                onClick={() => setStatus(item)}
              >
                <span>{t(`status.${item}`)}</span>
                <strong>{counts?.[item] ?? '—'}</strong>
              </button>
            ))}
          </div>
        </section>
        <form className={styles.filters} onSubmit={submitSearch}>
          <label className={styles.field}>
            {t('status')}
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as SupportStatus | 'all')
              }
            >
              <option value="all">{t('all')}</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {t(`status.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            {t('kind')}
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">{t('all')}</option>
              <option value="help">{t('kind.help')}</option>
              <option value="complaint">{t('kind.complaint')}</option>
            </select>
          </label>
          <label className={styles.field}>
            {t('assignment')}
            <select
              value={assignment}
              onChange={(event) => setAssignment(event.target.value)}
            >
              {['all', 'mine', 'unassigned'].map((item) => (
                <option key={item} value={item}>
                  {t(`assignment.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label className={`${styles.field} ${styles.searchField}`}>
            {t('search')}
            <input
              type="search"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button className={styles.secondary} type="submit">
            {t('searchSubmit')}
          </button>
        </form>
        <div
          className={styles.reviewLayout}
          data-selected={selected ? 'true' : 'false'}
        >
          <CaseQueue
            key={`${queueQuery}:${queueRefresh}`}
            query={queueQuery}
            selected={selected}
            onSelect={(id) => select(id)}
            onCounts={setCounts}
          />
          <section className={styles.detailColumn} aria-label={t('caseLink')}>
            {selected ? (
              <CaseDetail
                key={`${user.id}:${selected}`}
                refreshRevision={detailRefresh}
                caseId={selected}
                adminId={user.id}
                onBack={() => select(null)}
                onChanged={() => setQueueRefresh((value) => value + 1)}
              />
            ) : (
              <div className={styles.emptySelection}>
                <span aria-hidden="true" className={styles.emptyMark}>
                  /
                </span>
                <h2>{t('choose')}</h2>
                <p>{t('chooseHint')}</p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function CaseQueue({
  query,
  selected,
  onSelect,
  onCounts,
}: {
  query: string
  selected: string | null
  onSelect: (id: string) => void
  onCounts: (counts: AdminSupportQueueResponse['counts']) => void
}) {
  const { t, locale, when, error } = useSupportI18n()
  const [state, setState] = useState<{
    cases: AdminSupportQueueResponse['cases']
    nextCursor: string | null
    loading: boolean
    failure: unknown
  }>({ cases: [], nextCursor: null, loading: true, failure: null })
  const controller = useRef<AbortController | null>(null)
  const busy = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const previousSelection = useRef(selected)
  useEffect(() => {
    const wasSelected = previousSelection.current
    previousSelection.current = selected
    if (selected === null && wasSelected !== null) heading.current?.focus()
  }, [selected])
  useEffect(() => {
    const request = new AbortController()
    controller.current = request
    void api<AdminSupportQueueResponse>(`/api/admin/support?${query}`, {
      signal: request.signal,
    })
      .then((result) => {
        if (request.signal.aborted) return
        setState({
          cases: result.cases,
          nextCursor: result.nextCursor,
          loading: false,
          failure: null,
        })
        onCounts(result.counts)
      })
      .catch((value) => {
        if (!request.signal.aborted)
          setState({
            cases: [],
            nextCursor: null,
            loading: false,
            failure: value,
          })
      })
    return () => {
      request.abort()
      controller.current?.abort()
    }
  }, [query, onCounts])
  async function more() {
    if (busy.current || !state.nextCursor) return
    busy.current = true
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setState((current) => ({ ...current, loading: true, failure: null }))
    try {
      const result = await api<AdminSupportQueueResponse>(
        `/api/admin/support?${query}&cursor=${encodeURIComponent(state.nextCursor)}`,
        { signal: request.signal },
      )
      if (request.signal.aborted) return
      setState((current) => {
        const byId = new Map(current.cases.map((item) => [item.id, item]))
        result.cases.forEach((item) => byId.set(item.id, item))
        return {
          cases: [...byId.values()],
          nextCursor: result.nextCursor,
          loading: false,
          failure: null,
        }
      })
      onCounts(result.counts)
    } catch (value) {
      if (!request.signal.aborted)
        setState((current) => ({ ...current, loading: false, failure: value }))
    } finally {
      if (!request.signal.aborted) busy.current = false
    }
  }
  return (
    <section className={styles.queue} aria-label={t('filteredQueue')}>
      <header className={styles.queueHeading}>
        <h2 ref={heading} tabIndex={-1}>
          {t('filteredQueue')}
        </h2>
        <span>
          {t('shown')}: {state.cases.length}
        </span>
      </header>
      {state.failure !== null && (
        <div className={styles.error} role="alert">
          {error(state.failure)}
        </div>
      )}
      {!state.cases.length && !state.loading && state.failure === null && (
        <p className={styles.empty}>{t('empty')}</p>
      )}
      <ul className={styles.queueList}>
        {state.cases.map((item) => (
          <li key={item.id}>
            <button
              className={styles.caseRow}
              aria-pressed={selected === item.id}
              onClick={() => onSelect(item.id)}
            >
              <div className={styles.rowTop}>
                <strong>{item.orderNumber}</strong>
                <CaseStatus status={item.status} />
              </div>
              <span className={styles.rowTitle}>{item.titles[locale]}</span>
              <span>
                {item.venueName} · {item.buyerName}
              </span>
              <div className={styles.rowMeta}>
                <span className={styles.kind} data-kind={item.kind}>
                  {t(`kind.${item.kind}`)}
                </span>
                <span>{t(`category.${item.category}`)}</span>
              </div>
              <div className={styles.rowFooter}>
                <span>{item.assignee?.name ?? t('unassigned')}</span>
                <time dateTime={item.updatedAt}>{when(item.updatedAt)}</time>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {state.loading && (
        <p role="status" className={styles.empty}>
          {t('loading')}
        </p>
      )}
      {state.nextCursor && (
        <button
          className={styles.loadMore}
          disabled={state.loading}
          onClick={() => void more()}
        >
          {t(state.failure ? 'refresh' : 'loadMore')}
        </button>
      )}
    </section>
  )
}
