import type { User } from '../../api/index.transport'

export const emailPreferencesPath = '/profile#email-updates'

export function merchantOrderPath(orderId: string | null): string {
  return orderId &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      orderId,
    )
    ? `/merchant?order=${orderId}`
    : '/merchant'
}

export function accountHome(user: User): string {
  if (user.role === 'admin') return '/admin'
  return user.role === 'buyer' ? '/' : '/merchant'
}

export function supportCasePath(caseId: string | null): string {
  return caseId &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      caseId,
    )
    ? '/admin/support?case=' + caseId
    : '/admin/support'
}

export function authDestination(user: User, requested: string | null): string {
  if (
    !requested ||
    requested.includes('\\') ||
    Array.from(requested).some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return accountHome(user)
  if (
    requested === '/verify-email' ||
    requested === '/notifications' ||
    requested === emailPreferencesPath
  )
    return requested
  if (
    user.role === 'buyer' &&
    /^\/(offers\/[\w-]+|orders(?:\/[\w-]+)?)(?:\?[^#]*)?$/.test(requested)
  )
    return requested
  if (
    user.role === 'admin' &&
    (requested === '/admin' ||
      requested === '/admin/support' ||
      (requested.startsWith('/admin/support?case=') &&
        supportCasePath(requested.slice('/admin/support?case='.length)) ===
          requested))
  )
    return requested
  if (
    ['cafe', 'pickup'].includes(user.role) &&
    (requested === '/merchant' ||
      (requested.startsWith('/merchant?order=') &&
        merchantOrderPath(requested.slice('/merchant?order='.length)) ===
          requested))
  )
    return requested
  return accountHome(user)
}
