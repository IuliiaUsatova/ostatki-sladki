import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createOrderMailer,
  orderMailContent,
  OrderMailError,
} from '../src/server/order-mail.ts'
import type { OrderMail } from '../src/server/order-mail.ts'

const settings = {
  apiKey: 'fixture-key-not-a-provider-credential',
  senderEmail: 'sender@example.invalid',
  publicOrigin: 'https://food.example',
}
const message: OrderMail = {
  kind: 'order_confirmed',
  to: 'buyer@example.invalid',
  locale: 'en',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  payload: {
    orderId: '00000000-0000-4000-8000-000000000002',
    orderNumber: '0142',
    venueName: 'Cafe <script>alert(1)</script>',
    address: 'Almaty & nearby',
    translations: {
      ru: { title: 'Булочки', description: '', guarantee: '', allergens: [] },
      kk: { title: 'Тоқаштар', description: '', guarantee: '', allergens: [] },
      en: {
        title: 'Bread <img src=x onerror=alert(1)>',
        description: '',
        guarantee: '',
        allergens: [],
      },
    },
    quantity: 2,
    total: 2400,
    pickupStart: '2026-10-11T12:00:00Z',
    pickupEnd: '2026-10-11T13:00:00Z',
  },
}
test('all nine event emails have three languages, escaped business snapshots and authenticated order links only', () => {
  for (const locale of ['ru', 'kk', 'en'] as const)
    for (const kind of [
      'order_confirmed',
      'order_cancelled',
      'order_collected',
      'pickup_reminder',
      'booking_confirmed',
      'booking_cancelled',
      'booking_collected',
      'order_not_collected',
      'booking_not_collected',
    ] as const) {
      const content = orderMailContent(
        { ...message, kind, locale },
        settings.publicOrigin,
      )
      assert.match(content.htmlContent, new RegExp(`<html lang="${locale}">`))
      assert.match(content.textContent, /0142/)
      assert.match(content.textContent, /Asia\/Almaty/)
      if (locale === 'kk')
        assert.match(content.textContent, /11 қазан 2026, 17:00/)
      assert.doesNotMatch(content.htmlContent, /<script>|<img src=x/)
      assert.match(content.htmlContent, /&lt;script&gt;/)
      const links = content.textContent.match(/https:\/\/\S+/g)!
      const order = new URL(links[0])
      assert.equal(order.origin, settings.publicOrigin)
      assert.equal(
        order.pathname,
        kind.startsWith('booking_')
          ? '/merchant'
          : `/orders/${message.payload.orderId}`,
      )
      if (kind.startsWith('booking_'))
        assert.equal(order.searchParams.get('order'), message.payload.orderId)
      assert.equal(order.hash, '')
      assert.doesNotMatch(
        content.textContent,
        /buyer@example|token=|pickupCode|password|fixture-key/,
      )
    }
})

test('buyer and café email settings links open the exact protected profile section in text and HTML for all three languages', () => {
  for (const locale of ['ru', 'kk', 'en'] as const)
    for (const kind of ['order_confirmed', 'booking_confirmed'] as const) {
      const content = orderMailContent(
        { ...message, kind, locale },
        settings.publicOrigin,
      )
      const links = content.textContent.match(/https:\/\/\S+/g)!
      assert.equal(links.length, 2)
      const preferences = new URL(links[1])
      assert.equal(preferences.origin, settings.publicOrigin)
      assert.equal(preferences.pathname, '/profile')
      assert.equal(preferences.search, '')
      assert.equal(preferences.hash, '#email-updates')
      assert.ok(
        content.htmlContent.includes(
          'href="https://food.example/profile#email-updates"',
        ),
      )
      assert.doesNotMatch(
        content.textContent,
        /https:\/\/food\.example\/notifications/,
      )
    }
})

test('café cancellations explain the actor and localized reason without claiming a buyer cancellation or a refund', () => {
  const expected = {
    ru: ['Заведение отменило эту бронь.', 'Еды больше нет в наличии'],
    kk: ['Мекеме бұл тапсырысты тоқтатты.', 'Тағам қолжетімді емес'],
    en: ['The café cancelled this booking.', 'Food is no longer available'],
  }
  for (const locale of ['ru', 'kk', 'en'] as const)
    for (const kind of ['order_cancelled', 'booking_cancelled'] as const) {
      const content = orderMailContent(
        {
          ...message,
          kind,
          locale,
          payload: {
            ...message.payload,
            cancellation: { source: 'cafe', reason: 'unavailable' },
          },
        },
        settings.publicOrigin,
      )
      for (const text of expected[locale])
        assert.ok(content.textContent.includes(text))
      assert.doesNotMatch(
        content.textContent,
        /отменён покупателем|Сатып алушы тапсырысты тоқтатты|refund|возврат/i,
      )
      assert.doesNotMatch(
        content.textContent,
        /pickupCode|token=|buyer@example/,
      )
    }
})

test('mail rendering refuses untrusted origins and invalid identifiers before transport', () => {
  assert.throws(() =>
    orderMailContent(message, 'https://evil.example/redirect'),
  )
  assert.throws(
    () =>
      orderMailContent(
        { ...message, idempotencyKey: 'bad\r\nX-Test: injected' },
        settings.publicOrigin,
      ),
    OrderMailError,
  )
  assert.throws(
    () =>
      orderMailContent(
        { ...message, payload: { ...message.payload, orderId: '../admin' } },
        settings.publicOrigin,
      ),
    OrderMailError,
  )
})

test('transport accepts only 201, sends a stable payload idempotency header and never exposes provider bodies', async () => {
  const calls: RequestInit[] = []
  let status = 201
  const mailer = createOrderMailer({
    loadSettings: () => settings,
    fetcher: (async (_url, init) => {
      assert.equal(String(_url), 'https://api.brevo.com/v3/smtp/email')
      calls.push(init!)
      return new Response('private-provider-body buyer@example.invalid', {
        status,
      })
    }) as typeof fetch,
  })
  mailer.assertReady()
  await mailer.send(message)
  await mailer.send(message)
  for (const call of calls) {
    assert.equal(call.redirect, 'error')
    assert.ok(call.signal instanceof AbortSignal)
    const payload = JSON.parse(String(call.body))
    assert.equal(payload.headers['Idempotency-Key'], message.idempotencyKey)
    assert.deepEqual(payload.to, [{ email: message.to }])
    assert.doesNotMatch(String(call.body), /fixture-key/)
  }
  for (const [value, code, retryable] of [
    [429, 'MAIL_RATE_LIMIT', true],
    [500, 'MAIL_TEMPORARY', true],
    [408, 'MAIL_TEMPORARY', true],
    [400, 'MAIL_REJECTED', false],
    [401, 'MAIL_REJECTED', false],
    [403, 'MAIL_REJECTED', false],
    [200, 'MAIL_REJECTED', false],
  ] as const) {
    status = value
    await assert.rejects(
      mailer.send(message),
      (error) =>
        error instanceof OrderMailError &&
        error.code === code &&
        error.retryable === retryable &&
        !error.message.includes('private-provider-body'),
    )
  }
})

test('missing configuration and interrupted transport produce only safe errors and no fake success', async () => {
  let calls = 0
  const missing = createOrderMailer({
    loadSettings: () => {
      throw new Error('private credential detail')
    },
    fetcher: (async () => {
      calls++
      return new Response('', { status: 201 })
    }) as typeof fetch,
  })
  assert.throws(
    () => missing.assertReady(),
    (error) => error instanceof OrderMailError && error.code === 'MAIL_CONFIG',
  )
  await assert.rejects(
    missing.send(message),
    (error) =>
      error instanceof OrderMailError && error.message === 'MAIL_CONFIG',
  )
  assert.equal(calls, 0)
  const failed = createOrderMailer({
    loadSettings: () => settings,
    fetcher: (async () => {
      throw new Error('private network/provider detail')
    }) as typeof fetch,
  })
  await assert.rejects(
    failed.send(message),
    (error) =>
      error instanceof OrderMailError &&
      error.code === 'MAIL_TIMEOUT' &&
      error.retryable,
  )
})
