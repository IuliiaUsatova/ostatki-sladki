import type { Locale } from '../../api/index.transport'

export type EmailLink = {
  token: string | null
  locale: Locale | null
  status: 'ready' | 'missing' | 'invalid'
}

export function readEmailLink(fragment: string): EmailLink {
  const params = new URLSearchParams(fragment.replace(/^#/, ''))
  const language = params.get('lang')
  const locale =
    language === 'ru' || language === 'kk' || language === 'en'
      ? language
      : null
  const tokens = params.getAll('token')
  if (tokens.length === 0) return { token: null, locale, status: 'missing' }
  const token = tokens[0]
  if (
    tokens.length !== 1 ||
    !/^[A-Za-z0-9_-]{43}$/.test(token) ||
    params.getAll('lang').length > 1 ||
    [...params.keys()].some((key) => key !== 'token' && key !== 'lang')
  )
    return { token: null, locale, status: 'invalid' }
  return { token, locale, status: 'ready' }
}
