import { ApiError } from './client.ts'

// Preserve the attempt across a lost response or reload. The server owns deduplication.
export function attemptKey(scope: string): string {
  try {
    const storageKey = `ostatki:attempt:${scope}`
    const saved = sessionStorage.getItem(storageKey)
    if (saved) return saved
    const key = crypto.randomUUID()
    sessionStorage.setItem(storageKey, key)
    return key
  } catch {
    throw new ApiError(
      'Attempt storage unavailable',
      'STORAGE_UNAVAILABLE',
      400,
    )
  }
}

export function clearAttempt(scope: string) {
  try {
    sessionStorage.removeItem(`ostatki:attempt:${scope}`)
  } catch {
    /* Failed cleanup cannot invalidate a known server result. */
  }
}
