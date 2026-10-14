'use client'

import type { SupportStatus } from '@/shared/api'
import { useI18n } from '@/shared/i18n'
import { caseStatusMessages } from '../model/status-messages'
import styles from './case-status.module.css'

export default function CaseStatus({ status }: { status: SupportStatus }) {
  const { locale } = useI18n()
  return (
    <span className={styles.status} data-status={status}>
      {caseStatusMessages[locale][`status.${status}`]}
    </span>
  )
}
