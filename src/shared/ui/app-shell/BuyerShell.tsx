'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { useI18n } from '@/shared/i18n'
import { LanguageSwitcher } from '@/shared/ui/language-switcher'

export default function BuyerShell({
  title,
  children,
  back,
  footer,
  nav = true,
}: {
  title: string
  children: ReactNode
  back?: string
  footer?: ReactNode
  nav?: boolean
}) {
  const { t } = useI18n()
  const path = usePathname()
  const tabs = [
    { href: '/', key: 'catalog', icon: 'catalog' },
    { href: '/nearby', key: 'map', icon: 'map' },
    { href: '/orders', key: 'orders', icon: 'orders' },
    { href: '/profile', key: 'profile', icon: 'profile' },
  ]
  return (
    <div className="buyer-shell">
      <header className="buyer-header">
        {back && (
          <Link href={back} className="back-link" aria-label={t('back')}>
            <img src="/icons/back.svg" width="20" height="20" alt="" />
          </Link>
        )}
        <h1>{title}</h1>
        <LanguageSwitcher />
      </header>
      <main className="buyer-content">{children}</main>
      {footer && <div className="buyer-action">{footer}</div>}
      {nav && (
        <nav className="bottom-nav" aria-label={t('catalog')}>
          {tabs.map((tab) => {
            const active =
              tab.href === '/'
                ? path === '/' || path === '/home'
                : path.startsWith(tab.href)
            const src =
              tab.icon === 'map'
                ? '/icons/map.svg'
                : `/icons/${tab.icon}${active ? '-active' : ''}.svg`
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={active ? 'selected' : ''}
              >
                <img src={src} width="20" height="20" alt="" />
                <span>{t(tab.key)}</span>
              </Link>
            )
          })}
        </nav>
      )}
    </div>
  )
}
