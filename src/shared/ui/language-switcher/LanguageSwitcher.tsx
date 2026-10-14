'use client'

import type { Locale } from '@/shared/api'
import { useI18n } from '@/shared/i18n'

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <label className="language-switcher">
      <span className="sr-only">{t('language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t('language')}
      >
        <option value="en">EN</option>
        <option value="kk">ҚАЗ</option>
        <option value="ru">РУС</option>
      </select>
    </label>
  )
}
