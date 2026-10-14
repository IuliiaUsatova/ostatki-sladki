'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type {
  CafeCancellationReason,
  MerchantResponse,
  Order,
} from '@/shared/api'
import { api, ApiError } from '@/shared/api'
import { merchantOrderPath } from '@/shared/lib/auth-routing'
import { useFrozenAttempt } from '@/shared/lib/frozen-attempt'
import { useLifecycleI18n } from '@/entities/order'
import { lifecycleStyles as styles } from '@/shared/ui/order-layout'

const reasons: CafeCancellationReason[] = [
  'unavailable',
  'closed',
  'quality_issue',
  'other',
]
type CancellationAttempt = {
  reason: CafeCancellationReason
  note: string
  idempotencyKey: string
}
function isAttempt(value: unknown): value is CancellationAttempt {
  if (!value || typeof value !== 'object') return false
  const input = value as Partial<CancellationAttempt>
  return (
    !!input.reason &&
    reasons.includes(input.reason) &&
    typeof input.note === 'string' &&
    input.note.length <= 1000 &&
    (input.reason !== 'other' || input.note.trim().length >= 5) &&
    typeof input.idempotencyKey === 'string' &&
    /^[a-f0-9-]{36}$/.test(input.idempotencyKey)
  )
}

export default function CafeCancellation({
  order,
  actorId,
  onChanged,
}: {
  order: Order
  actorId: string
  onChanged: () => void
}) {
  const { t, error } = useLifecycleI18n()
  const original = useFrozenAttempt(
    `cafe-cancel:${actorId}:${order.id}`,
    isAttempt,
  )
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<CafeCancellationReason | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [validation, setValidation] = useState(false)
  const [status, setStatus] = useState<
    'cancellationConfirmed' | 'keepOriginal' | 'changedOrder' | null
  >(null)
  const controller = useRef<AbortController | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const authFailure =
    failure instanceof ApiError && [401, 403, 429].includes(failure.status)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      previous?.focus()
    }
  }, [open])
  async function cancel(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (busy || !original.ready) return
    setFailure(null)
    setValidation(false)
    setStatus(null)
    if (
      !original.attempt &&
      (!reason ||
        note.trim().length > 1000 ||
        (reason === 'other' && note.trim().length < 5))
    ) {
      setValidation(true)
      return
    }
    setBusy(true)
    const requestController = new AbortController()
    controller.current = requestController
    try {
      const frozen = original.freeze((idempotencyKey) => ({
        reason: reason as CafeCancellationReason,
        note: note.trim(),
        idempotencyKey,
      }))
      await api(`/api/merchant/orders/${encodeURIComponent(order.id)}/cancel`, {
        method: 'POST',
        body: JSON.stringify(frozen),
        signal: requestController.signal,
      })
      if (requestController.signal.aborted) return
      original.clear()
      setStatus('cancellationConfirmed')
      setOpen(false)
      onChanged()
    } catch (value) {
      if (requestController.signal.aborted) return
      setFailure(value)
      if (
        value instanceof ApiError &&
        [400, 409, 413, 415, 422].includes(value.status)
      )
        original.clear()
    } finally {
      if (!requestController.signal.aborted) setBusy(false)
    }
  }
  async function check() {
    if (busy) return
    setBusy(true)
    const requestController = new AbortController()
    controller.current = requestController
    try {
      const result = await api<MerchantResponse>('/api/merchant', {
        signal: requestController.signal,
      })
      if (requestController.signal.aborted) return
      const latest = result.orders.find((item) => item.id === order.id)
      const cancellation = latest?.cancellation
      if (
        latest?.status === 'cancelled' &&
        cancellation?.source === 'cafe' &&
        original.attempt &&
        cancellation.reason === original.attempt.reason &&
        cancellation.note === original.attempt.note
      ) {
        original.clear()
        setStatus('cancellationConfirmed')
        setOpen(false)
        setFailure(null)
      } else
        setStatus(
          latest?.status === 'confirmed' ? 'keepOriginal' : 'changedOrder',
        )
      onChanged()
    } catch (value) {
      if (!requestController.signal.aborted) setFailure(value)
    } finally {
      if (!requestController.signal.aborted) setBusy(false)
    }
  }
  if (!original.ready)
    return (
      <p className={styles.hint} role="status">
        {t('loading')}
      </p>
    )
  if (order.status !== 'confirmed' && !original.attempt && !status && !failure)
    return null
  return (
    <>
      {status && (
        <p
          className={
            status === 'cancellationConfirmed' ? styles.success : styles.notice
          }
          role="status"
        >
          {t(status)}
        </p>
      )}
      {original.attempt && (
        <section className={styles.notice} role="status">
          <p>{t(authFailure ? 'pendingOriginal' : 'cancellationUnknown')}</p>
          <p>{t(`reason.${original.attempt.reason}`)}</p>
          {original.attempt.note && (
            <p className={styles.note}>{original.attempt.note}</p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={() => cancel()}
            >
              {t(busy ? 'working' : 'retryOriginal')}
            </button>
            <button
              className={styles.secondary}
              type="button"
              disabled={busy}
              onClick={check}
            >
              {t('checkCancellation')}
            </button>
          </div>
        </section>
      )}
      {failure !== null && !open && (
        <p className={styles.error} role="alert">
          {error(failure)}
        </p>
      )}
      {failure instanceof ApiError && failure.status === 401 && !open && (
        <Link
          className={styles.secondary}
          href={`/login?next=${encodeURIComponent(merchantOrderPath(order.id))}`}
        >
          {t('signIn')}
        </Link>
      )}
      {failure instanceof ApiError &&
        failure.code === 'EMAIL_NOT_VERIFIED' &&
        !open && (
          <Link className={styles.secondary} href="/verify-email">
            {t('verifyEmail')}
          </Link>
        )}
      {order.status === 'confirmed' && !original.attempt && (
        <button
          className={styles.danger}
          type="button"
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          {t('cafeCancel')}
        </button>
      )}
      {open && (
        <dialog
          ref={dialog}
          className={styles.dialog}
          aria-labelledby={`cancel-${order.id}`}
          onCancel={(event) => {
            event.preventDefault()
            if (!busy) setOpen(false)
          }}
        >
          <form className={styles.form} onSubmit={cancel} aria-busy={busy}>
            <h2 id={`cancel-${order.id}`}>{t('cancelHeading')}</h2>
            <p className={styles.hint}>{t('cancelHint')}</p>
            <fieldset
              className={styles.fields}
              disabled={busy || !!original.attempt}
            >
              <label className={styles.field}>
                {t('cancelReason')}
                <select
                  value={original.attempt?.reason ?? reason}
                  required
                  onChange={(event) =>
                    setReason(event.target.value as CafeCancellationReason)
                  }
                >
                  <option value="">{t('chooseReason')}</option>
                  {reasons.map((value) => (
                    <option key={value} value={value}>
                      {t(`reason.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                {t('note')}
                <textarea
                  value={original.attempt?.note ?? note}
                  required={reason === 'other'}
                  minLength={reason === 'other' ? 5 : undefined}
                  maxLength={1000}
                  rows={4}
                  onChange={(event) => setNote(event.target.value)}
                />
                <span className={styles.hint}>{t('noteHint')}</span>
              </label>
            </fieldset>
            {validation && (
              <p className={styles.error} role="alert">
                {t('invalidCancellation')}
              </p>
            )}
            {failure !== null && (
              <p className={styles.error} role="alert">
                {error(failure)}
              </p>
            )}
            <div className={styles.actions}>
              <button className={styles.danger} type="submit" disabled={busy}>
                {t(
                  busy
                    ? 'working'
                    : original.attempt
                      ? 'retryOriginal'
                      : 'confirmCancel',
                )}
              </button>
              <button
                className={styles.secondary}
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                autoFocus
              >
                {t(original.attempt ? 'close' : 'keepBooking')}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  )
}
