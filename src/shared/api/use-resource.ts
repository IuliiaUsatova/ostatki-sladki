'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { resourceReads } from './client.ts'

export function useResource<T>(url: string) {
  const [state, setState] = useState<{
    data: T | null
    error: unknown
    loading: boolean
    url: string
  }>({ data: null, error: null, loading: true, url })
  const [revision, setRevision] = useState(0)
  const previousUrl = useRef(url)
  const reload = useCallback(() => {
    resourceReads.invalidate(url)
    setRevision((value) => value + 1)
  }, [url])
  useEffect(() => {
    if (previousUrl.current !== url) resourceReads.invalidate(url)
    previousUrl.current = url
    const read = resourceReads.read<T>(url)
    let active = true
    async function load() {
      try {
        const data = await read.promise
        if (active) setState({ data, error: null, loading: false, url })
      } catch (error) {
        if (active) setState({ data: null, error, loading: false, url })
      }
    }
    void load()
    return () => {
      active = false
      read.release()
    }
  }, [url, revision])
  return {
    ...(state.url === url ? state : { data: null, error: null, loading: true }),
    reload,
  }
}
