import { createResourceReadPool } from './resource-read.ts'

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(message: string, code = 'UNKNOWN', status = 0) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const mutation = method !== 'GET' && method !== 'HEAD'
  if (mutation) resourceReads.invalidate()
  try {
    return await request<T>(url, init)
  } finally {
    // Reads begun during an uncertain write are also ineligible for new consumers.
    if (mutation) resourceReads.invalidate()
  }
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('Connection lost', 'NETWORK', 0)
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(
      result?.error?.message ?? 'Request failed',
      result?.error?.code ?? 'UNKNOWN',
      response.status,
    )
  }
  if (result === null)
    throw new ApiError('Invalid server response', 'NETWORK', 0)
  return result as T
}
export const resourceReads = createResourceReadPool((url, signal) =>
  api(url, { signal }),
)
