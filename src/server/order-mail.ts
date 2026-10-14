import type {
  CafeCancellationReason,
  Locale,
  NotificationKind,
  NotificationSnapshot,
} from '../domain/types.ts'
import { emailPreferencesPath } from '../shared/lib/auth-routing/index.ts'
import { readMailSettings, trustedMailOrigin } from './mail-settings.ts'
import type { MailSettings } from './mail-settings.ts'

export type OrderMail = {
  kind: NotificationKind
  to: string
  locale: Locale
  payload: NotificationSnapshot
  idempotencyKey: string
}

export interface OrderMailer {
  assertReady(): void
  /** Resolves only when the provider accepts the request; this is not delivery. */
  send(message: OrderMail): Promise<void>
}

export type OrderMailErrorCode =
  | 'MAIL_CONFIG'
  | 'MAIL_TIMEOUT'
  | 'MAIL_RATE_LIMIT'
  | 'MAIL_TEMPORARY'
  | 'MAIL_REJECTED'

export class OrderMailError extends Error {
  readonly code: OrderMailErrorCode
  readonly retryable: boolean
  constructor(code: OrderMailErrorCode, retryable: boolean) {
    super(code)
    this.name = 'OrderMailError'
    this.code = code
    this.retryable = retryable
  }
}

const copy = {
  en: {
    order_confirmed: 'Your order is confirmed',
    order_cancelled: 'Your order was cancelled',
    order_collected: 'Your order has been collected',
    pickup_reminder: 'Pickup reminder',
    booking_confirmed: 'A new order is confirmed',
    booking_cancelled: 'An order was cancelled',
    booking_collected: 'An order has been collected',
    order_not_collected: 'The pickup window has ended',
    booking_not_collected: 'An order was not collected',
    cancelledByCafe: 'The café cancelled this booking.',
    cancelledByBuyer: 'The buyer cancelled this booking.',
    cancelReason: 'Reason',
    closedInstructions:
      'This booking is closed. Its pickup code can no longer be used.',
    notCollectedHint:
      'Collection was not recorded before the pickup window ended. If there was a problem, contact the café from the order page.',
    order: 'Order',
    quantity: 'Quantity',
    total: 'Total',
    pickup: 'Pickup window',
    open: 'Open order',
    settings: 'Manage email notifications',
    warning:
      'Sign in to your account to view the current order status. Pickup codes are shown only in the app.',
    footer: 'Ostatki · Good food nearby',
  },
  ru: {
    order_confirmed: 'Заказ подтверждён',
    order_cancelled: 'Заказ отменён',
    order_collected: 'Заказ получен',
    pickup_reminder: 'Напоминание о самовывозе',
    booking_confirmed: 'Подтверждён новый заказ',
    booking_cancelled: 'Заказ отменён',
    booking_collected: 'Заказ выдан',
    order_not_collected: 'Окно самовывоза закончилось',
    booking_not_collected: 'Заказ не получен',
    cancelledByCafe: 'Заведение отменило эту бронь.',
    cancelledByBuyer: 'Покупатель отменил эту бронь.',
    cancelReason: 'Причина',
    closedInstructions: 'Эта бронь закрыта. Код получения больше не действует.',
    notCollectedHint:
      'Выдача не была зафиксирована до конца окна самовывоза. Если возникла проблема, напиши заведению на странице заказа.',
    order: 'Заказ',
    quantity: 'Количество',
    total: 'Итого',
    pickup: 'Время самовывоза',
    open: 'Открыть заказ',
    settings: 'Настроить уведомления по email',
    warning:
      'Войди в свой аккаунт, чтобы увидеть актуальный статус заказа. Код получения доступен только в приложении.',
    footer: 'Остатки · Хорошая еда рядом',
  },
  kk: {
    order_confirmed: 'Тапсырыс расталды',
    order_cancelled: 'Тапсырыс тоқтатылды',
    order_collected: 'Тапсырыс алынды',
    pickup_reminder: 'Алып кету туралы еске салғыш',
    booking_confirmed: 'Жаңа тапсырыс расталды',
    booking_cancelled: 'Тапсырыс тоқтатылды',
    booking_collected: 'Тапсырыс берілді',
    order_not_collected: 'Алып кету уақыты аяқталды',
    booking_not_collected: 'Тапсырыс алынбады',
    cancelledByCafe: 'Мекеме бұл тапсырысты тоқтатты.',
    cancelledByBuyer: 'Сатып алушы бұл тапсырысты тоқтатты.',
    cancelReason: 'Себебі',
    closedInstructions: 'Бұл тапсырыс жабылды. Алу коды енді жарамсыз.',
    notCollectedHint:
      'Алып кету уақыты аяқталғанша беру тіркелмеді. Мәселе туындаса, тапсырыс парақшасында мекемеге жаз.',
    order: 'Тапсырыс',
    quantity: 'Саны',
    total: 'Барлығы',
    pickup: 'Алып кету уақыты',
    open: 'Тапсырысты ашу',
    settings: 'Email хабарландыруларын реттеу',
    warning:
      'Тапсырыстың қазіргі күйін көру үшін аккаунтыңа кір. Алу коды тек қолданбада көрсетіледі.',
    footer: 'Остатки · Жақсы тағам жақын жерде',
  },
} as const

const cancellationReasons: Record<
  Locale,
  Record<CafeCancellationReason, string>
> = {
  en: {
    unavailable: 'Food is no longer available',
    closed: 'The café cannot open for pickup',
    quality_issue: 'The food does not meet the café’s quality requirements',
    other: 'Another reason; see the order for details',
  },
  ru: {
    unavailable: 'Еды больше нет в наличии',
    closed: 'Заведение не может открыться для самовывоза',
    quality_issue: 'Еда не соответствует требованиям качества заведения',
    other: 'Другая причина; подробности в заказе',
  },
  kk: {
    unavailable: 'Тағам қолжетімді емес',
    closed: 'Мекеме алып кету үшін ашыла алмайды',
    quality_issue: 'Тағам мекеменің сапа талаптарына сай емес',
    other: 'Басқа себеп; толық ақпарат тапсырыста',
  },
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )

function pickupDate(value: string, locale: Locale): string {
  const date = new Date(value)
  if (locale !== 'kk')
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-KZ' : 'en-GB', {
      timeZone: 'Asia/Almaty',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  // Some Node ICU builds fall back to English month names for Kazakh.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)!.value
  const months = [
    'қаңтар',
    'ақпан',
    'наурыз',
    'сәуір',
    'мамыр',
    'маусым',
    'шілде',
    'тамыз',
    'қыркүйек',
    'қазан',
    'қараша',
    'желтоқсан',
  ]
  return `${part('day')} ${months[Number(part('month')) - 1]} ${part('year')}, ${part('hour')}:${part('minute')}`
}

export function orderMailContent(message: OrderMail, origin: string) {
  const m = copy[message.locale]
  const p = message.payload
  if (
    !m ||
    !Object.hasOwn(m, message.kind) ||
    !uuid.test(p.orderId) ||
    !uuid.test(message.idempotencyKey)
  )
    throw new OrderMailError('MAIL_REJECTED', false)
  const trusted = trustedMailOrigin(origin)
  const order = new URL(
    message.kind.startsWith('booking_') ? '/merchant' : `/orders/${p.orderId}`,
    trusted,
  )
  if (message.kind.startsWith('booking_'))
    order.searchParams.set('order', p.orderId)
  const settings = new URL(emailPreferencesPath, trusted)
  const details = [
    `${m.order} ${p.orderNumber}`,
    p.translations[message.locale].title,
    p.venueName,
    p.address,
    `${m.quantity}: ${p.quantity}`,
    `${m.total}: ${new Intl.NumberFormat(message.locale, { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(p.total)}`,
    `${m.pickup}: ${pickupDate(p.pickupStart, message.locale)} – ${pickupDate(p.pickupEnd, message.locale)} (Asia/Almaty)`,
  ]
  if (message.kind.endsWith('_cancelled')) {
    if (p.cancellation) {
      details.push(
        p.cancellation.source === 'cafe'
          ? m.cancelledByCafe
          : m.cancelledByBuyer,
      )
      if (p.cancellation.reason)
        details.push(
          `${m.cancelReason}: ${cancellationReasons[message.locale][p.cancellation.reason]}`,
        )
    }
    details.push(m.closedInstructions)
  } else if (message.kind.endsWith('_not_collected')) {
    details.push(m.notCollectedHint, m.closedInstructions)
  }
  const heading = m[message.kind]
  return {
    subject: `${heading} · ${m.footer.split(' · ')[0]}`,
    textContent: `${heading}\n\n${details.join('\n')}\n\n${m.open}: ${order}\n\n${m.warning}\n\n${m.settings}: ${settings}\n\n${m.footer}`,
    htmlContent: `<!doctype html><html lang="${message.locale}"><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#192733"><table role="presentation" style="width:100%;padding:32px 16px"><tr><td><table role="presentation" style="max-width:560px;width:100%;margin:auto;background:white;border:1px solid #dce3e8;border-radius:16px"><tr><td style="padding:32px"><p style="color:#075db1;font-weight:bold">${escapeHtml(m.footer)}</p><h1 style="font-size:24px">${escapeHtml(heading)}</h1>${details.map((line) => `<p style="font-size:16px;line-height:1.5">${escapeHtml(line)}</p>`).join('')}<p style="margin:28px 0"><a rel="noreferrer" href="${escapeHtml(order.toString())}" style="display:inline-block;background:#075db1;color:white;padding:14px 20px;border-radius:10px;text-decoration:none">${escapeHtml(m.open)}</a></p><p style="font-size:14px;color:#596979;line-height:1.5">${escapeHtml(m.warning)}</p><p><a rel="noreferrer" href="${escapeHtml(settings.toString())}">${escapeHtml(m.settings)}</a></p></td></tr></table></td></tr></table></body></html>`,
  }
}

export function createOrderMailer(
  options: { loadSettings?: () => MailSettings; fetcher?: typeof fetch } = {},
): OrderMailer {
  const load = options.loadSettings ?? readMailSettings
  const fetcher = options.fetcher ?? fetch
  function settings() {
    try {
      return load()
    } catch {
      throw new OrderMailError('MAIL_CONFIG', true)
    }
  }
  return {
    assertReady() {
      settings()
    },
    async send(message) {
      const config = settings()
      let content: ReturnType<typeof orderMailContent>
      try {
        content = orderMailContent(message, config.publicOrigin)
      } catch {
        throw new OrderMailError('MAIL_REJECTED', false)
      }
      if (
        !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(message.to) ||
        message.to.length > 254
      )
        throw new OrderMailError('MAIL_REJECTED', false)
      let response: Response
      try {
        response = await fetcher('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': config.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Ostatki', email: config.senderEmail },
            to: [{ email: message.to }],
            ...content,
            // Current Brevo reference uses this payload header. Provider deduplication has a finite TTL, not exactly-once delivery.
            headers: { 'Idempotency-Key': message.idempotencyKey },
            tags: [`ostatki-${message.kind}`],
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(4_000),
        })
      } catch {
        throw new OrderMailError('MAIL_TIMEOUT', true)
      }
      await response.body?.cancel().catch(() => {})
      if (response.status === 201) return
      if (response.status === 429)
        throw new OrderMailError('MAIL_RATE_LIMIT', true)
      if (response.status === 408 || response.status >= 500)
        throw new OrderMailError('MAIL_TEMPORARY', true)
      throw new OrderMailError('MAIL_REJECTED', false)
    },
  }
}
