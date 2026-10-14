'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Locale } from '@/shared/api'
import { I18nContext } from '@/shared/i18n'

export function AppProviders({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: ReactNode
}) {
  const [locale, updateLocale] = useState(initialLocale)
  const setLocale = useCallback((value: Locale) => {
    document.cookie = `ostatki_locale=${value}; Path=/; Max-Age=31536000; SameSite=Lax`
    updateLocale(value)
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
