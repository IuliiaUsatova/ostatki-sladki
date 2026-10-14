import type { OfferTranslation, Locale } from '@/shared/api'
export function inputDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value))
  const part = (kind: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === kind)?.value
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}
export const blankTranslation = (): OfferTranslation => ({
  title: '',
  description: '',
  guarantee: '',
  allergens: [],
})
export const languageNames: Record<Locale, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}
