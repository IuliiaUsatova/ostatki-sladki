import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DomainError } from '../domain/errors.ts'

export interface MailSettings {
  apiKey: string
  senderEmail: string
  publicOrigin: string
}

export function trustedMailOrigin(value: unknown): string {
  if (typeof value !== 'string') throw unavailable()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw unavailable()
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))
  )
    throw unavailable()
  return url.origin
}

export function unavailable() {
  return new DomainError(
    'MAIL_UNAVAILABLE',
    'Отправка писем временно недоступна. Попробуйте позже.',
    503,
  )
}

export function readMailSettings(): MailSettings {
  let saved: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(resolve(process.cwd(), 'data/email-settings.json'), 'utf8'),
    )
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      saved = parsed as Record<string, unknown>
  } catch {
    // Missing private settings are a configuration state, never a successful send.
  }
  const apiKey = process.env.BREVO_API_KEY ?? saved.apiKey
  const senderEmail = process.env.OSTATKI_MAIL_FROM ?? saved.senderEmail
  const publicOrigin = trustedMailOrigin(
    process.env.OSTATKI_PUBLIC_ORIGIN ?? saved.publicOrigin,
  )
  // A hosted origin must also configure HTTP Origin checks and Secure cookies.
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(publicOrigin).hostname,
    ) &&
    process.env.OSTATKI_PUBLIC_ORIGIN !== publicOrigin
  )
    throw unavailable()
  if (
    typeof apiKey !== 'string' ||
    apiKey.length < 20 ||
    apiKey.length > 500 ||
    /[\r\n]/.test(apiKey) ||
    typeof senderEmail !== 'string' ||
    senderEmail.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(senderEmail)
  )
    throw unavailable()
  return { apiKey, senderEmail, publicOrigin }
}
