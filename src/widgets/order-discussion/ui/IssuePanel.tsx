'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Order, OrderIssue, OrderIssueResponse } from '@/shared/api'
import { api, ApiError } from '@/shared/api'
import { merchantOrderPath } from '@/shared/lib/auth-routing'
import { useFrozenAttempt } from '@/shared/lib/frozen-attempt'
import { useLifecycleI18n } from '@/entities/order'
import { lifecycleStyles as styles } from '@/shared/ui/order-layout'
import { OrderSupport } from '@/features/request-support'
import { useSupportI18n } from '@/entities/support-case'

const categories = [
  'pickup_problem',
  'food_problem',
  'cancellation',
  'other',
] as const
type Category = (typeof categories)[number]
type IssueAttempt =
  | {
      action: 'create'
      payload: { category: Category; message: string; idempotencyKey: string }
    }
  | { action: 'message'; payload: { message: string; idempotencyKey: string } }
function isAttempt(value: unknown): value is IssueAttempt {
  if (!value || typeof value !== 'object') return false
  const saved = value as Partial<IssueAttempt>
  const payload = saved.payload
  return (
    !!payload &&
    typeof payload.message === 'string' &&
    payload.message.trim().length >= 5 &&
    payload.message.length <= 2000 &&
    typeof payload.idempotencyKey === 'string' &&
    /^[a-f0-9-]{36}$/.test(payload.idempotencyKey) &&
    (saved.action === 'message' ||
      (saved.action === 'create' &&
        'category' in payload &&
        categories.includes(payload.category)))
  )
}

export default function IssuePanel({
  order,
  role,
  actorId,
  onChanged,
}: {
  order: Order
  role: 'buyer' | 'cafe'
  actorId: string
  onChanged?: () => void
}) {
  const { t, when, error } = useLifecycleI18n()
  const supportText = useSupportI18n()
  const [issue, setIssue] = useState<OrderIssue | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [supportBusy, setSupportBusy] = useState(false)
  const [category, setCategory] = useState<Category | ''>('')
  const [message, setMessage] = useState('')
  const [failedDraft, setFailedDraft] = useState<string | null>(null)
  const [failure, setFailure] = useState<unknown>(null)
  const [validation, setValidation] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [resolveUnknown, setResolveUnknown] = useState(false)
  const [success, setSuccess] = useState<'saved' | 'resolved' | null>(null)
  const requestController = useRef<AbortController | null>(null)
  const url = `/api/orders/${encodeURIComponent(order.id)}/issue`
  const original = useFrozenAttempt(`issue:${actorId}:${order.id}`, isAttempt)
  const confirmedOnce = order.events.some((event) => event.type === 'confirmed')
  const canOpen =
    role === 'buyer' &&
    (['confirmed', 'collected', 'not_collected'].includes(order.status) ||
      (order.status === 'cancelled' && confirmedOnce))
  const atLimit = !!issue && issue.messages.length >= 50
  const cafeClosed = role === 'cafe' && issue?.status === 'resolved'
  const supportActive = !!issue?.support && issue.support.status !== 'resolved'
  const authFailure =
    failure instanceof ApiError && [401, 403, 429].includes(failure.status)
  const returnPath =
    role === 'buyer'
      ? `/orders/${encodeURIComponent(order.id)}`
      : merchantOrderPath(order.id)
  const editable =
    !busy &&
    !supportBusy &&
    original.ready &&
    !original.attempt &&
    !needsReload &&
    !resolveUnknown
  useEffect(() => {
    const controller = new AbortController()
    requestController.current = controller
    void api<OrderIssueResponse>(url, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setIssue(result.issue)
          setLoaded(true)
          setLoadFailed(false)
        }
      })
      .catch((value) => {
        if (!controller.signal.aborted) {
          setFailure(value)
          setLoaded(true)
          setLoadFailed(true)
        }
      })
    return () => {
      controller.abort()
      requestController.current?.abort()
    }
  }, [url])
  const reload = useCallback(async (): Promise<boolean> => {
    if (busy || supportBusy) return false
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setBusy(true)
    try {
      const result = await api<OrderIssueResponse>(url, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) return false
      setIssue(result.issue)
      setLoaded(true)
      setLoadFailed(false)
      setFailure(null)
      setNeedsReload(false)
      setResolveUnknown(false)
      return true
    } catch (value) {
      if (!controller.signal.aborted) {
        setFailure(value)
        if (
          value instanceof ApiError &&
          [401, 403, 404].includes(value.status)
        ) {
          setIssue(null)
          setLoadFailed(true)
        }
      }
      return false
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }, [url, busy, supportBusy])
  useEffect(() => {
    const refreshVisible = () => {
      if (
        document.visibilityState === 'visible' &&
        !original.attempt &&
        !needsReload &&
        !resolveUnknown
      )
        void reload()
    }
    window.addEventListener('focus', refreshVisible)
    const timer = setInterval(refreshVisible, 30_000)
    return () => {
      window.removeEventListener('focus', refreshVisible)
      clearInterval(timer)
    }
  }, [reload, original.attempt, needsReload, resolveUnknown])
  async function send(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (busy || supportBusy || !original.ready || resolveUnknown || needsReload)
      return
    setValidation(false)
    setFailure(null)
    setSuccess(null)
    if (
      !original.attempt &&
      ((!issue && !category) ||
        message.trim().length < 5 ||
        message.trim().length > 2000)
    ) {
      setValidation(true)
      return
    }
    const controller = new AbortController()
    requestController.current = controller
    setBusy(true)
    let submitted: IssueAttempt | null = original.attempt
    try {
      const frozen = original.freeze((idempotencyKey) =>
        issue
          ? {
              action: 'message',
              payload: { message: message.trim(), idempotencyKey },
            }
          : {
              action: 'create',
              payload: {
                category: category as Category,
                message: message.trim(),
                idempotencyKey,
              },
            },
      )
      submitted = frozen
      const result = await api<OrderIssueResponse>(
        frozen.action === 'create' ? url : `${url}/messages`,
        {
          method: 'POST',
          body: JSON.stringify(frozen.payload),
          signal: controller.signal,
        },
      )
      if (controller.signal.aborted) return
      setIssue(result.issue)
      original.clear()
      setMessage('')
      setFailedDraft(null)
      setSuccess('saved')
      onChanged?.()
    } catch (value) {
      if (controller.signal.aborted) return
      setFailure(value)
      if (
        value instanceof ApiError &&
        [400, 409, 413, 415, 422].includes(value.status) &&
        !['IDEMPOTENCY_CONFLICT', 'STORAGE_UNAVAILABLE'].includes(value.code)
      ) {
        if (submitted) {
          setMessage(submitted.payload.message)
          if (submitted.action === 'create')
            setCategory(submitted.payload.category)
          setFailedDraft(submitted.payload.message)
        }
        original.clear()
        if (value.status === 409) setNeedsReload(true)
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  async function resolve() {
    if (
      !issue ||
      role !== 'buyer' ||
      busy ||
      supportBusy ||
      supportActive ||
      original.attempt ||
      needsReload ||
      resolveUnknown
    )
      return
    const controller = new AbortController()
    requestController.current = controller
    setBusy(true)
    setFailure(null)
    setSuccess(null)
    try {
      const result = await api<OrderIssueResponse>(`${url}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ revision: issue.revision }),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setIssue(result.issue)
      setSuccess('resolved')
      onChanged?.()
    } catch (value) {
      if (controller.signal.aborted) return
      setFailure(value)
      if (
        value instanceof ApiError &&
        (value.status === 0 || value.status >= 500)
      )
        setResolveUnknown(true)
      else setNeedsReload(true)
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  if (
    !canOpen &&
    !issue &&
    loaded &&
    !failure &&
    !original.attempt &&
    role === 'buyer'
  )
    return null
  return (
    <section className={styles.panel}>
      <h2>{t(role === 'buyer' ? 'issueTitle' : 'cafeIssueTitle')}</h2>
      <p className={styles.hint}>
        {t(role === 'buyer' ? 'issueIntro' : 'cafeIssueIntro')}
      </p>
      {!loaded || !original.ready ? (
        <p role="status">{t('loading')}</p>
      ) : (
        !loadFailed && (
          <>
            {issue ? (
              <>
                <span className={styles.status} data-status={issue.status}>
                  {issue.support
                    ? supportText.t(`status.${issue.support.status}`)
                    : t(`issue.${issue.status}`)}
                </span>
                <p>{t(`category.${issue.category}`)}</p>
                <ol className={styles.messages}>
                  {issue.messages.map((entry) => (
                    <li
                      key={entry.id}
                      className={styles.message}
                      data-role={entry.authorRole}
                    >
                      <div className={styles.meta}>
                        <strong>
                          {t(entry.authorRole)} · {entry.authorName}
                        </strong>
                        <time dateTime={entry.createdAt}>
                          {when(entry.createdAt)}
                        </time>
                      </div>
                      <p className={styles.messageBody}>{entry.body}</p>
                    </li>
                  ))}
                </ol>
                <p className={styles.hint}>{t('originalLanguage')}</p>
              </>
            ) : (
              role === 'cafe' && <p className={styles.hint}>{t('noIssue')}</p>
            )}
            {failedDraft && (
              <div className={styles.notice} role="status">
                <p>{supportText.t('unsentDraft')}</p>
                <p className={styles.messageBody}>{failedDraft}</p>
              </div>
            )}
            {original.attempt && (
              <div className={styles.notice} role="status">
                <p>{t(authFailure ? 'pendingOriginal' : 'unknownMessage')}</p>
                <p className={styles.messageBody}>
                  {original.attempt.payload.message}
                </p>
                <button
                  className={styles.secondary}
                  type="button"
                  disabled={busy || needsReload || resolveUnknown}
                  onClick={() => send()}
                >
                  {t(busy ? 'sending' : 'retryOriginal')}
                </button>
              </div>
            )}
            {resolveUnknown && (
              <p className={styles.notice} role="status">
                {t('resolveUnknown')}
              </p>
            )}
            {atLimit && <p className={styles.hint}>{t('limit')}</p>}
            {cafeClosed && (
              <p className={styles.hint}>{t('cafeResolvedHint')}</p>
            )}
            {(issue || canOpen) && !atLimit && !cafeClosed && (
              <form onSubmit={send} className={styles.form} aria-busy={busy}>
                <fieldset className={styles.fields} disabled={!editable}>
                  {!issue && (
                    <label className={styles.field}>
                      {t('category')}
                      <select
                        value={
                          original.attempt?.action === 'create'
                            ? original.attempt.payload.category
                            : category
                        }
                        required
                        onChange={(event) =>
                          setCategory(event.target.value as Category)
                        }
                      >
                        <option value="">{t('chooseCategory')}</option>
                        {categories.map((kind) => (
                          <option key={kind} value={kind}>
                            {t(`category.${kind}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={styles.field}>
                    {t('message')}
                    <textarea
                      value={original.attempt?.payload.message ?? message}
                      required
                      minLength={5}
                      maxLength={2000}
                      rows={4}
                      onChange={(event) => {
                        setMessage(event.target.value)
                        setFailedDraft(null)
                        setValidation(false)
                        setSuccess(null)
                      }}
                    />
                    <span className={styles.hint}>{t('messageHint')}</span>
                  </label>
                </fieldset>
                {!original.attempt && (
                  <button
                    className={styles.primary}
                    type="submit"
                    disabled={!editable}
                  >
                    {t(
                      busy ? 'sending' : issue ? 'sendMessage' : 'createIssue',
                    )}
                  </button>
                )}
              </form>
            )}
            {role === 'buyer' &&
              issue &&
              issue.status !== 'resolved' &&
              !supportActive && (
                <>
                  <p className={styles.hint}>{t('resolveHint')}</p>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={!editable}
                    onClick={resolve}
                  >
                    {t('resolve')}
                  </button>
                </>
              )}
            {supportActive && (
              <p className={styles.hint}>{supportText.t('activeResolve')}</p>
            )}
            <OrderSupport
              key={'support:' + actorId + ':' + order.id}
              order={order}
              issue={issue}
              actorId={actorId}
              role={role}
              disabled={
                busy ||
                !original.ready ||
                !!original.attempt ||
                needsReload ||
                resolveUnknown
              }
              onBusyChange={setSupportBusy}
              onReload={reload}
              onUpdated={(next) => {
                setIssue(next)
                setFailure(null)
                setSuccess(null)
                onChanged?.()
              }}
            />
          </>
        )
      )}
      {validation && (
        <p className={styles.error} role="alert">
          {t('invalidMessage')}
        </p>
      )}
      {failure !== null && (
        <p className={styles.error} role="alert">
          {failure instanceof ApiError && failure.code.startsWith('SUPPORT_')
            ? supportText.error(failure)
            : error(failure)}
        </p>
      )}
      {failure instanceof ApiError && failure.status === 401 && (
        <Link
          className={styles.secondary}
          href={`/login?next=${encodeURIComponent(returnPath)}`}
        >
          {t('signIn')}
        </Link>
      )}
      {failure instanceof ApiError && failure.code === 'EMAIL_NOT_VERIFIED' && (
        <Link className={styles.secondary} href="/verify-email">
          {t('verifyEmail')}
        </Link>
      )}
      {success && (
        <p className={styles.success} role="status">
          {t(success)}
        </p>
      )}
      <button
        className={styles.secondary}
        type="button"
        disabled={busy || supportBusy || !loaded}
        onClick={reload}
      >
        {t(busy ? 'working' : 'refresh')}
      </button>
    </section>
  )
}
