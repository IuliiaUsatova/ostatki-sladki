import { Suspense } from 'react'
import { Profile } from '@/_pages/profile'
export default function Page() {
  return (
    <Suspense>
      <Profile />
    </Suspense>
  )
}
