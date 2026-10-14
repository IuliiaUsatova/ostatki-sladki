'use client'

import { useOfferText } from '@/entities/offer'
import { useLifecycleI18n } from '@/entities/order'
import type { Order } from '@/shared/api'
import { api, ApiError, attemptKey, clearAttempt } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { useEffect, useRef, useState } from 'react'

export type OrderViewProps = {
  order: Order
  serverNow: string
  reload: () => void
}

export function useOrderController({
  order,
  serverNow,
  reload,
}: OrderViewProps) {
  const { t, formatMoney, formatTime, formatDate, errorText } = useI18n()
  const offerText = useOfferText()
  const { t: lifecycleText } = useLifecycleI18n()
  const [clock, setClock] = useState({ serverNow, elapsed: 0 })
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const [askCancel, setAskCancel] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const submitting = useRef(false)
  const checkedDeadline = useRef<string | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    const started = performance.now()
    const interval = setInterval(
      () => setClock({ serverNow, elapsed: performance.now() - started }),
      1000,
    )
    return () => clearInterval(interval)
  }, [serverNow])
  const now =
    Date.parse(serverNow) + (clock.serverNow === serverNow ? clock.elapsed : 0)
  useEffect(() => {
    const deadline =
      order.status === 'reserved'
        ? order.expiresAt
        : order.status === 'confirmed'
          ? order.snapshot.pickupEnd
          : null
    const key = deadline ? `${order.status}:${deadline}` : null
    if (
      deadline &&
      key &&
      now >= Date.parse(deadline) &&
      checkedDeadline.current !== key
    ) {
      checkedDeadline.current = key
      reload()
    }
  }, [now, order.status, order.expiresAt, order.snapshot.pickupEnd, reload])
  const seconds = Math.max(
    0,
    Math.ceil((Date.parse(order.expiresAt) - now) / 1000),
  )
  const expired = order.status === 'expired'
  const held = order.status === 'reserved' && !expired
  const canCancel =
    order.status === 'reserved' ||
    (order.status === 'confirmed' &&
      now < Date.parse(order.snapshot.pickupStart))
  const text = offerText(order.snapshot)
  const title = held
    ? t('checkout')
    : expired
      ? t('expired')
      : order.status === 'collected'
        ? t('collected')
        : order.status === 'cancelled'
          ? t('cancelled')
          : order.status === 'not_collected'
            ? lifecycleText('notCollected')
            : t('ticket')
  async function act(action: 'confirm' | 'cancel') {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    setFailure(null)
    const scope = `${action}:${order.id}`
    const requestController = new AbortController()
    controller.current = requestController
    let committed = false
    try {
      await api(`/api/orders/${order.id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: attemptKey(scope) }),
        signal: requestController.signal,
      })
      if (requestController.signal.aborted) return
      committed = true
      clearAttempt(scope)
      setAskCancel(false)
    } catch (error) {
      if (!requestController.signal.aborted) setFailure(error)
    } finally {
      submitting.current = false
      if (!requestController.signal.aborted) setPending(false)
    }
    if (committed) reload()
  }
  const needsVerification =
    failure instanceof ApiError && failure.code === 'EMAIL_NOT_VERIFIED'
  return {
    t,
    formatMoney,
    formatTime,
    formatDate,
    errorText,
    lifecycleText,
    pending,
    failure,
    askCancel,
    setAskCancel,
    now,
    seconds,
    expired,
    held,
    canCancel,
    text,
    title,
    act,
    needsVerification,
  }
}
