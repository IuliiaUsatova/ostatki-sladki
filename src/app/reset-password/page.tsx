import type { Metadata } from 'next'
import { ResetPassword } from '@/features/account-security'

export const metadata: Metadata = {
  title: 'Reset password',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}
export default function Page() {
  return <ResetPassword />
}
