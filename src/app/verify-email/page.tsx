import type { Metadata } from 'next'
import { VerifyEmail } from '@/features/account-security'

export const metadata: Metadata = {
  title: 'Confirm email',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
}
export default function Page() {
  return <VerifyEmail />
}
