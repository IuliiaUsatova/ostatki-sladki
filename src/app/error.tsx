'use client'
import { BuyerShell } from '@/shared/ui/app-shell'
import { ErrorState } from '@/shared/ui/feedback'
import { useI18n } from '@/shared/i18n'
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const { t } = useI18n()
  return (
    <BuyerShell title={t('brand')}>
      <ErrorState error={error} retry={reset} />
    </BuyerShell>
  )
}
