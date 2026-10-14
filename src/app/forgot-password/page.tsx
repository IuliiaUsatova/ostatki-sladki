import type { Metadata } from 'next'
import { ForgotPassword } from '@/features/account-security'

export const metadata: Metadata = {
  title: 'Recover account',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}
export default function Page() {
  return <ForgotPassword />
}
