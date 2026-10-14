'use client'
import type { ReactNode } from 'react'
import type { Order } from '@/shared/api'
import { useMerchantI18n } from '@/entities/venue'
import { merchantStyles as styles } from '@/shared/ui/merchant-layout'
export function Status({ order }: { order: Order }) {
  const { t } = useMerchantI18n()
  const tone =
    order.status === 'collected'
      ? 'success'
      : order.status === 'reserved'
        ? 'warning'
        : order.status === 'confirmed'
          ? 'info'
          : 'muted'
  return (
    <span className={styles.status} data-tone={tone}>
      {t(`status.${order.status}`)}
    </span>
  )
}

export function Notice({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <aside className={styles.notice}>
      {title && <h2>{title}</h2>}
      <p>{children}</p>
    </aside>
  )
}
