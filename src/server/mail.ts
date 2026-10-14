import type { Locale } from '../domain/types.ts'
import {
  readMailSettings,
  trustedMailOrigin,
  unavailable,
} from './mail-settings.ts'
import type { MailSettings } from './mail-settings.ts'

export type AuthMail =
  | {
      kind: 'verify_email' | 'reset_password'
      to: string
      locale: Locale
      token: string
    }
  | { kind: 'password_changed'; to: string; locale: Locale }

export interface AuthMailer {
  assertReady(): void
  send(message: AuthMail): Promise<void>
}

export const unconfiguredMailer: AuthMailer = {
  assertReady() {
    throw unavailable()
  },
  async send() {
    throw unavailable()
  },
}

const copy = {
  en: {
    verify_email: {
      subject: 'Confirm your email · Ostatki',
      heading: 'One more step to join Ostatki',
      body: 'Confirm the email for your account. Sign in to the same account first, then open this link and confirm. The link is valid for 24 hours.',
      action: 'Confirm email',
      warning:
        'Only confirm if you created this account. If you did not request this message, ignore it. Do not share this link.',
    },
    reset_password: {
      subject: 'Reset your password · Ostatki',
      heading: 'Choose a new password',
      body: 'Use this link to set a new password for your Ostatki account. The link is valid for 30 minutes. Changing your password signs out every existing session.',
      action: 'Reset password',
      warning:
        'If you did not request a password reset, ignore this email. Your password will remain unchanged. Do not share this link.',
    },
    password_changed: {
      subject: 'Your password was changed · Ostatki',
      heading: 'Your account password has changed',
      body: 'All previous sessions have been signed out. If you did not make this change, use password recovery immediately to secure your account.',
      action: 'Open password recovery',
      warning: 'Ostatki will never ask you to send your password by email.',
    },
    fallback:
      'If the button does not work, copy this address into your browser:',
    footer: 'Ostatki · Good food nearby',
  },
  ru: {
    verify_email: {
      subject: 'Подтверди email · Остатки',
      heading: 'Остался один шаг',
      body: 'Подтверди email своего аккаунта. Сначала войди в тот же аккаунт, затем открой ссылку и подтверди адрес. Ссылка действует 24 часа.',
      action: 'Подтвердить email',
      warning:
        'Подтверждай адрес, только если ты создала этот аккаунт. Если письмо пришло без твоего запроса, проигнорируй его. Не передавай ссылку другим.',
    },
    reset_password: {
      subject: 'Восстановление пароля · Остатки',
      heading: 'Придумай новый пароль',
      body: 'Открой ссылку, чтобы задать новый пароль для аккаунта Остатков. Ссылка действует 30 минут. После смены пароля все прежние сессии будут закрыты.',
      action: 'Восстановить пароль',
      warning:
        'Если ты не запрашивала восстановление, проигнорируй письмо. Пароль останется прежним. Не передавай ссылку другим.',
    },
    password_changed: {
      subject: 'Пароль изменён · Остатки',
      heading: 'Пароль твоего аккаунта изменён',
      body: 'Все прежние сессии закрыты. Если это была не ты, сразу воспользуйся восстановлением пароля, чтобы вернуть доступ к аккаунту.',
      action: 'Открыть восстановление',
      warning:
        'Остатки никогда не попросят отправить пароль в ответном письме.',
    },
    fallback: 'Если кнопка не работает, скопируй этот адрес в браузер:',
    footer: 'Остатки · Хорошая еда рядом',
  },
  kk: {
    verify_email: {
      subject: 'Email мекенжайын раста · Остатки',
      heading: 'Тағы бір қадам қалды',
      body: 'Аккаунтыңның email мекенжайын раста. Алдымен сол аккаунтқа кіріп, содан кейін сілтемені ашып, мекенжайды раста. Сілтеме 24 сағат жарамды.',
      action: 'Email мекенжайын растау',
      warning:
        'Бұл аккаунтты өзің ашқан болсаң ғана раста. Хатты сұратпаған болсаң, оны елеме. Сілтемені басқа адамға берме.',
    },
    reset_password: {
      subject: 'Құпиясөзді қалпына келтіру · Остатки',
      heading: 'Жаңа құпиясөз ойлап тап',
      body: 'Остатки аккаунтыңа жаңа құпиясөз орнату үшін сілтемені аш. Сілтеме 30 минут жарамды. Құпиясөз өзгергеннен кейін барлық бұрынғы сессиялар жабылады.',
      action: 'Құпиясөзді қалпына келтіру',
      warning:
        'Қалпына келтіруді сұратпаған болсаң, хатты елеме. Құпиясөз өзгермейді. Сілтемені басқа адамға берме.',
    },
    password_changed: {
      subject: 'Құпиясөз өзгертілді · Остатки',
      heading: 'Аккаунтыңның құпиясөзі өзгерді',
      body: 'Барлық бұрынғы сессиялар жабылды. Бұл өзгерісті сен жасамаған болсаң, аккаунтыңды қорғау үшін дереу құпиясөзді қалпына келтір.',
      action: 'Қалпына келтіруді ашу',
      warning: 'Остатки құпиясөзді жауап хатпен жіберуді ешқашан сұрамайды.',
    },
    fallback: 'Батырма жұмыс істемесе, мына мекенжайды браузерге көшір:',
    footer: 'Остатки · Жақсы тағам жақын жерде',
  },
} as const

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  )

export function authMailContent(message: AuthMail, origin: string) {
  const m = copy[message.locale]
  const content = m[message.kind]
  const url = new URL(
    message.kind === 'verify_email'
      ? '/verify-email'
      : message.kind === 'reset_password'
        ? '/reset-password'
        : '/forgot-password',
    trustedMailOrigin(origin),
  )
  if (message.kind !== 'password_changed') {
    if (!/^[A-Za-z0-9_-]{43}$/.test(message.token)) throw unavailable()
    url.hash = new URLSearchParams({
      token: message.token,
      lang: message.locale,
    }).toString()
  }
  const link = url.toString()
  return {
    subject: content.subject,
    textContent: `${content.heading}\n\n${content.body}\n\n${content.action}: ${link}\n\n${content.warning}\n\n${m.footer}`,
    htmlContent: `<!doctype html><html lang="${message.locale}"><body style="margin:0;background:#f4f6f9;font-family:Arial,sans-serif;color:#192733"><table role="presentation" style="width:100%;padding:32px 16px"><tr><td><table role="presentation" style="max-width:520px;width:100%;margin:auto;background:#fff;border:1px solid #dce3e8;border-radius:16px"><tr><td style="padding:32px"><p style="color:#075db1;font-weight:bold;font-size:22px;margin:0 0 28px">${escapeHtml(m.footer)}</p><h1 style="font-size:24px;line-height:1.3">${escapeHtml(content.heading)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(content.body)}</p><p style="margin:28px 0"><a rel="noreferrer" href="${escapeHtml(link)}" style="display:inline-block;background:#075db1;color:white;padding:14px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${escapeHtml(content.action)}</a></p><p style="font-size:14px;line-height:1.6;color:#596979">${escapeHtml(content.warning)}</p><hr style="border:0;border-top:1px solid #dce3e8;margin:24px 0"><p style="font-size:12px;line-height:1.5;color:#596979">${escapeHtml(m.fallback)}</p><p style="font-size:12px;line-height:1.5;word-break:break-all"><a rel="noreferrer" href="${escapeHtml(link)}">${escapeHtml(link)}</a></p></td></tr></table></td></tr></table></body></html>`,
  }
}

export function createAuthMailer(
  options: {
    loadSettings?: () => MailSettings
    fetcher?: typeof fetch
  } = {},
): AuthMailer {
  const load = options.loadSettings ?? readMailSettings
  const fetcher = options.fetcher ?? fetch
  return {
    assertReady() {
      load()
    },
    async send(message) {
      const settings = load()
      const content = authMailContent(message, settings.publicOrigin)
      try {
        const response = await fetcher('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': settings.apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Ostatki', email: settings.senderEmail },
            to: [{ email: message.to }],
            ...content,
            tags: [`ostatki-${message.kind}`],
          }),
          redirect: 'error',
          signal: AbortSignal.timeout(4_000),
        })
        // Provider errors may contain addresses, links and keys. Never propagate them.
        if (response.status !== 201) {
          await response.body?.cancel()
          throw unavailable()
        }
        await response.body?.cancel()
      } catch {
        throw unavailable()
      }
    },
  }
}
