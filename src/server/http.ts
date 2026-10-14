import { DomainError, invariant } from '../domain/errors.ts'
import type { User } from '../domain/types.ts'
import { MarketplaceService, SESSION_TTL_MS } from './service.ts'
import { getService } from './runtime.ts'

export const SESSION_COOKIE = 'ostatki_session'
const MAX_BODY_BYTES = 16_384

function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const directHost = request.headers.get('host')
  let candidate = url
  if (directHost !== null) {
    invariant(
      directHost.length <= 300 &&
        /^(?:[a-z\d.-]+|\[[a-f\d:]+\])(?::\d{1,5})?$/i.test(directHost),
      'ORIGIN_REJECTED',
      'Недопустимый адрес запроса.',
      403,
    )
    try {
      candidate = new URL(`${url.protocol}//${directHost}`)
    } catch {
      throw new DomainError(
        'ORIGIN_REJECTED',
        'Недопустимый адрес запроса.',
        403,
      )
    }
  }
  const fixedOrigin = process.env.OSTATKI_PUBLIC_ORIGIN
  if (fixedOrigin) {
    let configured: URL
    try {
      configured = new URL(fixedOrigin)
    } catch {
      throw new DomainError(
        'INTERNAL_ERROR',
        'Неверная настройка адреса приложения.',
        500,
      )
    }
    invariant(
      (configured.protocol === 'http:' || configured.protocol === 'https:') &&
        configured.origin === fixedOrigin,
      'INTERNAL_ERROR',
      'Неверная настройка адреса приложения.',
      500,
    )
    return configured.origin
  }
  const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
  // Next normalizes localhost URLs; accept the direct, same-port loopback alias only.
  invariant(
    candidate.port === url.port &&
      (candidate.hostname === url.hostname ||
        (loopback.has(candidate.hostname) && loopback.has(url.hostname))),
    'ORIGIN_REJECTED',
    'Недопустимый адрес запроса.',
    403,
  )
  return candidate.origin
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  invariant(
    origin !== null && origin === requestOrigin(request),
    'ORIGIN_REJECTED',
    'Запрос должен быть отправлен из приложения.',
    403,
  )
  const fetchSite = request.headers.get('sec-fetch-site')
  invariant(
    fetchSite !== 'cross-site',
    'ORIGIN_REJECTED',
    'Запрос должен быть отправлен из приложения.',
    403,
  )
}

export function sessionToken(request: Request): string | null {
  const cookie = request.headers.get('cookie') ?? ''
  const matches = cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SESSION_COOKIE}=`))
  if (matches.length !== 1) return null
  const token = matches[0].slice(SESSION_COOKIE.length + 1)
  return /^[a-zA-Z0-9_-]{43}$/.test(token) ? token : null
}

export function sessionCookie(request: Request, token: string | null): string {
  return `${SESSION_COOKIE}=${token ?? ''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_TTL_MS / 1000 : 0}${requestOrigin(request).startsWith('https:') ? '; Secure' : ''}`
}

export async function readJson(
  request: Request,
  maxBytes = MAX_BODY_BYTES,
): Promise<unknown> {
  invariant(
    Number.isSafeInteger(maxBytes) && maxBytes > 0 && maxBytes <= 32_768,
    'INTERNAL_ERROR',
    'Неверный предел размера запроса.',
    500,
  )
  invariant(
    request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ===
      'application/json',
    'INVALID_INPUT',
    'Ожидается запрос application/json.',
    415,
  )
  invariant(request.body, 'INVALID_INPUT', 'Нет данных запроса.')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new DomainError('BODY_TOO_LARGE', 'Слишком большой запрос.', 413)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer))
  } catch {
    throw new DomainError('INVALID_INPUT', 'Не удалось прочитать JSON запроса.')
  }
}

export function json(
  value: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('Vary', 'Cookie')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(value), { status, headers })
}

type Handler = (context: {
  service: MarketplaceService
  user: User | null
  token: string | null
}) => unknown | Promise<unknown>

export async function endpoint(
  request: Request,
  mutation: boolean,
  handler: Handler,
  serviceOverride?: MarketplaceService,
): Promise<Response> {
  try {
    if (mutation) assertSameOrigin(request)
    const service = serviceOverride ?? getService()
    const token = sessionToken(request)
    const value = await handler({
      service,
      user: service.session(token),
      token,
    })
    return value instanceof Response ? value : json(value)
  } catch (error) {
    if (error instanceof DomainError)
      return json(
        { error: { code: error.code, message: error.message } },
        error.status,
      )
    return json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message:
            'Не удалось выполнить запрос. Обновите данные и попробуйте снова.',
        },
      },
      500,
    )
  }
}
