import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  authMailContent,
  createAuthMailer,
  unconfiguredMailer,
} from '../src/server/mail.ts'
import { trustedMailOrigin } from '../src/server/mail-settings.ts'
import { DomainError } from '../src/domain/errors.ts'

const token = 't'.repeat(43)
const settings = {
  apiKey: 'fixture-mail-test-not-a-real-key',
  senderEmail: 'sender@example.invalid',
  publicOrigin: 'https://ostatki.example',
}

test('mail links use an explicitly trusted origin and keep tokens out of the query', () => {
  for (const locale of ['ru', 'kk', 'en'] as const) {
    for (const kind of ['verify_email', 'reset_password'] as const) {
      const result = authMailContent(
        { kind, locale, token, to: 'buyer@example.invalid' },
        settings.publicOrigin,
      )
      const textLink = result.textContent.match(/https:\/\/\S+/)![0]
      const url = new URL(textLink)
      assert.equal(url.origin, settings.publicOrigin)
      assert.equal(
        url.pathname,
        kind === 'verify_email' ? '/verify-email' : '/reset-password',
      )
      assert.equal(url.search, '')
      assert.equal(new URLSearchParams(url.hash.slice(1)).get('token'), token)
      assert.equal(new URLSearchParams(url.hash.slice(1)).get('lang'), locale)
      assert.match(result.htmlContent, new RegExp(`<html lang="${locale}">`))
      assert.ok(result.subject.length > 0)
    }
  }
})

test('mail rejects attacker origins, malformed tokens and nonlocal HTTP', () => {
  for (const value of [
    'https://user:pass@example.com',
    'https://example.com/path',
    'https://example.com/',
    'https://example.com?next=bad',
    'http://example.com',
    'javascript:alert(1)',
    'https://example.com#token',
  ])
    assert.throws(() => trustedMailOrigin(value), DomainError)
  assert.equal(
    trustedMailOrigin('http://localhost:3103'),
    'http://localhost:3103',
  )
  assert.equal(
    trustedMailOrigin('http://127.0.0.1:3103'),
    'http://127.0.0.1:3103',
  )
  assert.throws(
    () =>
      authMailContent(
        {
          kind: 'verify_email',
          locale: 'en',
          token: '<script>',
          to: 'buyer@example.invalid',
        },
        settings.publicOrigin,
      ),
    DomainError,
  )
})

test('password-change notices contain no password, credential or one-time link', () => {
  for (const locale of ['ru', 'kk', 'en'] as const) {
    const content = authMailContent(
      { kind: 'password_changed', locale, to: 'buyer@example.invalid' },
      settings.publicOrigin,
    )
    assert.match(
      content.textContent,
      /https:\/\/ostatki\.example\/forgot-password/,
    )
    assert.doesNotMatch(
      content.textContent,
      /#token=|fixture-mail-test|buyer@example/,
    )
    assert.doesNotMatch(content.htmlContent, /#token=/)
  }
})

test('transport uses the fixed provider API, bounded timeout and no redirect following', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const mailer = createAuthMailer({
    loadSettings: () => settings,
    fetcher: (async (url, init) => {
      calls.push({ url: String(url), init: init! })
      return new Response('{"messageId":"fixture-id"}', { status: 201 })
    }) as typeof fetch,
  })
  mailer.assertReady()
  await mailer.send({
    kind: 'reset_password',
    locale: 'en',
    token,
    to: 'buyer@example.invalid',
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email')
  assert.equal(calls[0].init.redirect, 'error')
  assert.ok(calls[0].init.signal instanceof AbortSignal)
  const body = JSON.parse(String(calls[0].init.body))
  assert.equal(body.sender.email, settings.senderEmail)
  assert.deepEqual(body.to, [{ email: 'buyer@example.invalid' }])
  assert.doesNotMatch(
    String(calls[0].init.body),
    /fixture-mail-test-not-a-real-key/,
  )
})

test('transport strips provider errors and never treats unavailable email as sent', async () => {
  assert.throws(
    () => unconfiguredMailer.assertReady(),
    (error: unknown) =>
      error instanceof DomainError && error.code === 'MAIL_UNAVAILABLE',
  )
  for (const status of [301, 400, 401, 429, 500]) {
    const mailer = createAuthMailer({
      loadSettings: () => settings,
      fetcher: (async () =>
        new Response('private-provider-body-with-key-and-token', {
          status,
        })) as typeof fetch,
    })
    await assert.rejects(
      mailer.send({
        kind: 'verify_email',
        locale: 'en',
        token,
        to: 'buyer@example.invalid',
      }),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === 'MAIL_UNAVAILABLE' &&
        !error.message.includes('private-provider'),
    )
  }
  const networkFailure = createAuthMailer({
    loadSettings: () => settings,
    fetcher: (async () => {
      throw new Error('private-network-details')
    }) as typeof fetch,
  })
  await assert.rejects(
    networkFailure.send({
      kind: 'verify_email',
      locale: 'en',
      token,
      to: 'buyer@example.invalid',
    }),
    (error: unknown) =>
      error instanceof DomainError &&
      error.code === 'MAIL_UNAVAILABLE' &&
      !error.message.includes('private-network'),
  )
})
