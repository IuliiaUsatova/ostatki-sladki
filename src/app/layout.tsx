import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/600.css'
import { AppProviders } from '../_app/providers'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Ostatki · Good food nearby', template: '%s · Ostatki' },
  description:
    'A food-rescue marketplace. Discover meals and surprise bags, reserve securely and collect at your local café.',
  robots: { index: false, follow: false },
}
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const saved = (await cookies()).get('ostatki_locale')?.value
  const locale = saved === 'ru' || saved === 'kk' ? saved : 'en'
  return (
    <html lang={locale}>
      <body>
        <AppProviders initialLocale={locale}>{children}</AppProviders>
      </body>
    </html>
  )
}
