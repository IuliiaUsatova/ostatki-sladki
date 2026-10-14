'use client'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError, type Order } from '@/shared/api'
import {
  useFrozenAttempt,
  isDefinitiveMutationFailure,
} from '@/shared/lib/frozen-attempt'
type PickupAttempt = { code: string; idempotencyKey: string }
function isPickupAttempt(value: unknown): value is PickupAttempt {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<PickupAttempt>
  return (
    typeof p.code === 'string' &&
    /^[0-9]{6}$/.test(p.code) &&
    typeof p.idempotencyKey === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      p.idempotencyKey,
    )
  )
}
export function usePickupDesk(
  actorId: string,
  onCollected: () => void | Promise<void>,
) {
  const [draftCode, setDraftCode] = useState('')
  const [order, setOrder] = useState<Order | null>(null)
  const [physical, setPhysical] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const requestController = useRef<AbortController | null>(null)
  const lock = useRef(false)
  const knownCommit = useRef(false)
  const attempt = useFrozenAttempt(
    `merchant-pickup:${actorId}`,
    isPickupAttempt,
  )
  const code = attempt.attempt?.code ?? draftCode
  const uncertain = !!attempt.attempt || !!attempt.failure
  useEffect(() => () => requestController.current?.abort(), [])
  function setCode(value: string) {
    if (lock.current || uncertain || !attempt.ready) return
    requestController.current?.abort()
    setDraftCode(value.replace(/\D/g, ''))
    setOrder(null)
    setFailure(null)
    setPhysical(false)
    knownCommit.current = false
  }
  async function lookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (lock.current || uncertain || !attempt.ready) return
    lock.current = true
    setBusy(true)
    setFailure(null)
    setOrder(null)
    setPhysical(false)
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    try {
      const result = await api<{ order: Order }>(
        `/api/merchant/pickup?code=${encodeURIComponent(code)}`,
        { signal: controller.signal },
      )
      if (!controller.signal.aborted) setOrder(result.order)
    } catch (error) {
      if (!controller.signal.aborted) setFailure(error)
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        lock.current = false
      }
    }
  }
  async function confirm() {
    if (
      lock.current ||
      knownCommit.current ||
      !attempt.ready ||
      (!uncertain && (!order || order.status !== 'confirmed' || !physical))
    )
      return
    lock.current = true
    setBusy(true)
    setFailure(null)
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    let success = false
    try {
      const frozen = attempt.freeze((key) => {
        if (
          !order ||
          order.status !== 'confirmed' ||
          !physical ||
          !/^\d{6}$/.test(code)
        )
          throw new ApiError('Invalid input', 'INVALID_INPUT', 400)
        return { code, idempotencyKey: key }
      })
      const result = await api<{ order: Order }>('/api/merchant/pickup', {
        method: 'POST',
        body: JSON.stringify(frozen),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      knownCommit.current = true
      setOrder(result.order)
      setDraftCode(frozen.code)
      attempt.clear()
      success = true
    } catch (error) {
      if (controller.signal.aborted) return
      setFailure(error)
      if (isDefinitiveMutationFailure(error)) {
        const originalCode = attempt.attempt?.code ?? code
        setDraftCode(originalCode)
        attempt.clear()
        if (error instanceof ApiError && error.code === 'ALREADY_COLLECTED') {
          try {
            const result = await api<{ order: Order }>(
              `/api/merchant/pickup?code=${encodeURIComponent(originalCode)}`,
              { signal: controller.signal },
            )
            if (!controller.signal.aborted) setOrder(result.order)
          } catch {
            /* The mutation was rejected; the user can look up the current booking again. */
          }
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false)
        lock.current = false
      }
    }
    if (success) {
      try {
        await onCollected()
      } catch (error) {
        if (!controller.signal.aborted) setFailure(error)
      }
    }
  }
  return {
    code,
    setCode,
    order,
    physical,
    setPhysical,
    busy,
    failure: failure ?? attempt.failure,
    uncertain,
    ready: attempt.ready,
    lookup,
    confirm,
  }
}
