'use client'

import { useEffect, useMemo, useState } from 'react'
import { createMutationAttempt } from './mutation-attempt'

export type FrozenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const browserStorage: FrozenStorage = {
  getItem: (key) => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: (key) => sessionStorage.removeItem(key),
}

export function useFrozenAttempt<T>(
  scope: string,
  validate: (value: unknown) => value is T,
  storage: FrozenStorage = browserStorage,
) {
  const protocol = useMemo(
    () => createMutationAttempt({ scope, storage, validate }),
    [scope, storage, validate],
  )
  const [state, setState] = useState<{
    protocol: typeof protocol
    attempt: T | null
    ready: boolean
    failure: unknown
  }>({ protocol, attempt: null, ready: false, failure: null })
  useEffect(() => {
    let active = true
    let attempt: T | null = null
    let failure: unknown = null
    try {
      attempt = protocol.restore()
    } catch (error) {
      failure = error
    }
    queueMicrotask(() => {
      if (active) setState({ protocol, attempt, ready: true, failure })
    })
    return () => {
      active = false
    }
  }, [protocol])
  function freeze(make: (key: string) => T): T {
    const attempt = protocol.freeze(make)
    setState({ protocol, attempt, ready: true, failure: null })
    return attempt
  }
  function clear() {
    protocol.complete()
    setState({ protocol, attempt: null, ready: true, failure: null })
  }
  const current =
    state.protocol === protocol
      ? state
      : { attempt: null, ready: false, failure: null }
  return { ...current, freeze, clear }
}
