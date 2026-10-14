'use client'
import Link from 'next/link'
import { BuyerShell } from '@/shared/ui/app-shell'
import { useI18n } from '@/shared/i18n'
export default function NotFound() {
  const { t } = useI18n()
  return (
    <BuyerShell title={t('notFound')}>
      <div className="empty-state">
        <p>{t('notFoundHint')}</p>
        <Link className="button" href="/">
          {t('browse')}
        </Link>
      </div>
    </BuyerShell>
  )
}
