'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type {
  Order,
  OrderIssue,
  OrderIssueCategory,
  OrderIssueResponse,
  SupportKind,
} from '@/shared/api'
import { api, ApiError } from '@/shared/api'
import { merchantOrderPath } from '@/shared/lib/auth-routing'
import { useFrozenAttempt } from '@/shared/lib/frozen-attempt'
import { SupportHistory, SupportDecision } from '@/entities/support-case'
import { useSupportI18n } from '@/entities/support-case'
import { supportStyles as styles } from '@/shared/ui/support-layout'

const categories: OrderIssueCategory[] = [
  'pickup_problem',
  'food_problem',
  'cancellation',
  'other',
]
type SupportAttempt = {
  kind: SupportKind
  category: OrderIssueCategory
  message: string
  idempotencyKey: string
}
function isAttempt(value: unknown): value is SupportAttempt {
  if (!value || typeof value !== 'object') return false
  const input = value as Partial<SupportAttempt>
  return (
    (input.kind === 'help' || input.kind === 'complaint') &&
    !!input.category &&
    categories.includes(input.category) &&
    typeof input.message === 'string' &&
    input.message.trim().length >= 5 &&
    input.message.length <= 2000 &&
    typeof input.idempotencyKey === 'string' &&
    /^[a-f0-9-]{36}$/.test(input.idempotencyKey)
  )
}

export default function OrderSupport({
  order,
  issue,
  actorId,
  role,
  disabled,
  onUpdated,
  onBusyChange,
  onReload,
}: {
  order: Order
  issue: OrderIssue | null
  actorId: string
  role: 'buyer' | 'cafe'
  disabled: boolean
  onUpdated: (issue: OrderIssue) => void
  onBusyChange: (busy: boolean) => void
  onReload: () => Promise<boolean>
}) {
  const { t, error } = useSupportI18n()
  const original = useFrozenAttempt(
    'support-escalate:' + actorId + ':' + order.id,
    isAttempt,
  )
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<SupportKind>('help')
  const [category, setCategory] = useState<OrderIssueCategory | ''>('')
  const [message, setMessage] = useState('')
  const [failedDraft, setFailedDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [invalid, setInvalid] = useState(false)
  const [saved, setSaved] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const support = issue?.support
  const eligible =
    ['confirmed', 'collected', 'not_collected'].includes(order.status) ||
    (order.status === 'cancelled' &&
      order.events.some((event) => event.type === 'confirmed'))
  const active = !!support && support.status !== 'resolved'
  const formVisible = open && !original.attempt && !active
  const returnPath =
    role === 'buyer'
      ? '/orders/' + encodeURIComponent(order.id)
      : merchantOrderPath(order.id)
  useEffect(() => () => controller.current?.abort(), [])

  async function submit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (busy || disabled || !original.ready || needsReload) return
    setFailure(null)
    setInvalid(false)
    setSaved(false)
    const chosenCategory = issue?.category ?? category
    if (
      !original.attempt &&
      (!chosenCategory ||
        message.trim().length < 5 ||
        message.trim().length > 2000)
    ) {
      setInvalid(true)
      return
    }
    const requestController = new AbortController()
    controller.current = requestController
    setBusy(true)
    onBusyChange(true)
    let submitted: SupportAttempt | null = original.attempt
    try {
      const frozen = original.freeze((idempotencyKey) => ({
        kind: support?.kind ?? kind,
        category: chosenCategory as OrderIssueCategory,
        message: message.trim(),
        idempotencyKey,
      }))
      submitted = frozen
      const result = await api<OrderIssueResponse>(
        '/api/orders/' + encodeURIComponent(order.id) + '/issue/support',
        {
          method: 'POST',
          body: JSON.stringify(frozen),
          signal: requestController.signal,
        },
      )
      if (requestController.signal.aborted) return
      if (!result.issue?.support)
        throw new ApiError('Invalid support response', 'NETWORK', 0)
      original.clear()
      onUpdated(result.issue)
      setMessage('')
      setFailedDraft(null)
      setOpen(false)
      setSaved(true)
    } catch (value) {
      if (requestController.signal.aborted) return
      setFailure(value)
      if (
        value instanceof ApiError &&
        [400, 409, 413, 415, 422].includes(value.status) &&
        !['IDEMPOTENCY_CONFLICT', 'STORAGE_UNAVAILABLE'].includes(value.code)
      ) {
        if (submitted) {
          setMessage(submitted.message)
          setKind(submitted.kind)
          setCategory(submitted.category)
          setFailedDraft(submitted.message)
          setOpen(true)
        }
        original.clear()
        if (value.status === 409) setNeedsReload(true)
      }
    } finally {
      if (!requestController.signal.aborted) {
        setBusy(false)
        onBusyChange(false)
      }
    }
  }
  async function refresh() {
    if (busy || disabled) return
    if (await onReload()) {
      setNeedsReload(false)
      setFailure(null)
    }
  }
  if (!eligible && !original.attempt) return null
  return (
    <section className={styles.panel}>
      <h2>{t('title')}</h2>
      {support ? (
        <>
          <span className={styles.status} data-status={support.status}>
            {t('status.' + support.status)}
          </span>
          <strong>{t('kind.' + support.kind)}</strong>
          <p className={styles.hint}>
            {support.assignee
              ? t('assigned') + ': ' + support.assignee.name
              : t('unassigned')}
          </p>
          {active && <p className={styles.hint}>{t('activeHint')}</p>}
          {support.resolution && (
            <SupportDecision resolution={support.resolution} />
          )}
          <SupportHistory support={support} />
        </>
      ) : (
        <p className={styles.hint}>{t('intro')}</p>
      )}
      {saved && (
        <p className={styles.success} role="status">
          {t('saved')}
        </p>
      )}
      {failedDraft && (
        <div className={styles.notice} role="status">
          <p>{t('unsentDraft')}</p>
          <p className={styles.body}>{failedDraft}</p>
        </div>
      )}
      {original.attempt && (
        <div className={styles.notice} role="status">
          <p>{t(busy ? 'working' : 'pending')}</p>
          <strong>{t('kind.' + original.attempt.kind)}</strong>
          <p className={styles.hint}>
            {t('category.' + original.attempt.category)}
          </p>
          <p className={styles.body}>{original.attempt.message}</p>
          <button
            className={styles.secondary}
            type="button"
            disabled={busy || disabled || needsReload}
            onClick={() => submit()}
          >
            {t(busy ? 'working' : 'retryOriginal')}
          </button>
        </div>
      )}
      {!active && !formVisible && (
        <button
          className={styles.secondary}
          type="button"
          disabled={busy || disabled || !original.ready}
          onClick={() => {
            setOpen(true)
            setSaved(false)
          }}
        >
          {t(support ? 'reopenForm' : 'openForm')}
        </button>
      )}
      {formVisible && (
        <form onSubmit={submit} className={styles.form} aria-busy={busy}>
          <p className={styles.hint}>{t('sharing')}</p>
          <fieldset
            className={styles.fields}
            disabled={busy || disabled || !!original.attempt || needsReload}
          >
            <label className={styles.field}>
              {t('kind')}
              <select
                value={original.attempt?.kind ?? support?.kind ?? kind}
                disabled={!!support}
                onChange={(event) => setKind(event.target.value as SupportKind)}
              >
                <option value="help">{t('kind.help')}</option>
                <option value="complaint">{t('kind.complaint')}</option>
              </select>
            </label>
            {!issue && (
              <label className={styles.field}>
                {t('category')}
                <select
                  value={original.attempt?.category ?? category}
                  required
                  onChange={(event) =>
                    setCategory(event.target.value as OrderIssueCategory)
                  }
                >
                  <option value="">{t('chooseCategory')}</option>
                  {categories.map((entry) => (
                    <option key={entry} value={entry}>
                      {t('category.' + entry)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.field}>
              {t('message')}
              <textarea
                value={original.attempt?.message ?? message}
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                onChange={(event) => {
                  setMessage(event.target.value)
                  setFailedDraft(null)
                  setInvalid(false)
                }}
              />
              <span className={styles.hint}>{t('messageHint')}</span>
            </label>
          </fieldset>
          {invalid && (
            <p className={styles.error} role="alert">
              {t('invalid')}
            </p>
          )}
          <div className={styles.actions}>
            {!original.attempt && (
              <button
                className={styles.primary}
                type="submit"
                disabled={busy || disabled || needsReload || !original.ready}
              >
                {t(busy ? 'working' : support ? 'resubmit' : 'send')}
              </button>
            )}
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t('closeForm')}
            </button>
          </div>
        </form>
      )}
      {failure !== null && (
        <p className={styles.error} role="alert">
          {error(failure)}
        </p>
      )}
      {failure instanceof ApiError && failure.status === 401 && (
        <Link
          className={styles.secondary}
          href={'/login?next=' + encodeURIComponent(returnPath)}
        >
          {t('signIn')}
        </Link>
      )}
      {needsReload && (
        <button
          className={styles.secondary}
          type="button"
          disabled={busy || disabled}
          onClick={refresh}
        >
          {t('refresh')}
        </button>
      )}
    </section>
  )
}
