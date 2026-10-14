import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { DomainError } from '../src/domain/errors.ts'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { grantAdministrator } from '../src/server/auth.ts'
import type { AuthMail, AuthMailer } from '../src/server/mail.ts'
import {
  AUTH_MAIL_COOLDOWN_MS,
  PASSWORD_RESET_TTL_MS,
  VERIFICATION_TTL_MS,
} from '../src/server/auth-lifecycle.ts'
import { endpoint, json, readJson, sessionCookie } from '../src/server/http.ts'

const INITIAL_TIME = Date.parse('2026-10-11T12:00:00Z')
const PASSWORD = 'Correct horse батарея 123!'
const NEW_PASSWORD = '  An entirely new password 456!  '
const buyer = (email = 'customer@example.invalid') => ({
  name: 'Email Customer',
  email,
  password: PASSWORD,
  locale: 'en',
  accountType: 'buyer',
})
const cafe = () => ({
  ...buyer('cafe@example.invalid'),
  accountType: 'cafe',
  venue: {
    name: 'Email Bakery',
    address: 'Abay 44, Almaty',
    description: 'Fresh bakery with collection offers every evening.',
    contactPhone: '+77000000000',
  },
})
const code = (expected: string) => (error: unknown) =>
  error instanceof DomainError && error.code === expected

class Mailer implements AuthMailer {
  messages: AuthMail[] = []
  ready = true
  fail = false
  sendDelayMs = 0
  assertReady() {
    if (!this.ready)
      throw new DomainError('MAIL_UNAVAILABLE', 'Mail unavailable', 503)
  }
  async send(message: AuthMail) {
    this.messages.push(message)
    if (this.sendDelayMs) await delay(this.sendDelayMs)
    if (this.fail) throw new Error('provider unavailable')
  }
  token(kind: 'verify_email' | 'reset_password', to?: string): string {
    const message = this.messages.findLast(
      (item) => item.kind === kind && (!to || item.to === to),
    )
    assert.ok(message && 'token' in message)
    return message.token
  }
}

function fixture(path = ':memory:', mailResponseDelayMs = 0) {
  let time = INITIAL_TIME
  const repository = new Repository(path, time, { seedFixtures: true })
  const mailer = new Mailer()
  const service = new MarketplaceService(repository, () => time, {
    mailer,
    mailResponseDelayMs,
  })
  return {
    repository,
    mailer,
    service,
    advance: (ms: number) => {
      time += ms
    },
  }
}

test('registration sends ownership proof, stores only hashed capabilities and keeps existing accounts unverified', async () => {
  const f = fixture()
  try {
    const result = await f.service.register(buyer())
    assert.equal(result.verificationEmailSent, true)
    assert.equal(result.user.emailVerified, false)
    const token = f.mailer.token('verify_email')
    assert.match(token, /^[a-zA-Z0-9_-]{43}$/)
    const persisted = f.repository.db
      .prepare('SELECT * FROM auth_tokens')
      .get()!
    assert.equal(
      persisted.token_hash,
      createHash('sha256').update(token).digest('hex'),
    )
    assert.equal(persisted.expires_at, INITIAL_TIME + VERIFICATION_TTL_MS)
    assert.ok(!JSON.stringify(persisted).includes(token))
    assert.ok(!JSON.stringify(result.user).includes('password'))
    assert.throws(
      () => f.service.confirmVerification(null, { token }),
      code('AUTH_REQUIRED'),
    )
    const wrong = (await f.service.register(buyer('wrong@example.invalid')))
      .user
    assert.throws(
      () => f.service.confirmVerification(wrong, { token }),
      code('VERIFY_ACCOUNT_MISMATCH'),
    )
    assert.deepEqual(f.service.confirmVerification(result.user, { token }), {
      verified: true,
    })
    assert.equal(f.repository.user(result.user.id)?.emailVerified, true)
    assert.equal(f.service.session(result.token), null)
    assert.throws(
      () => f.service.confirmVerification(result.user, { token }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
    assert.equal(
      f.service.session(
        (
          await f.service.login({
            email: result.user.email,
            password: PASSWORD,
          })
        ).token,
      )?.emailVerified,
      true,
    )
  } finally {
    f.repository.close()
  }
})

test('tokens are purpose bound, strict, expire at their exact boundary and cannot inject identities', async () => {
  const f = fixture()
  try {
    const result = await f.service.register(buyer())
    const verification = f.mailer.token('verify_email')
    await assert.rejects(
      f.service.resetPassword({ token: verification, password: NEW_PASSWORD }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
    await f.service.forgotPassword({ email: result.user.email, locale: 'kk' })
    const reset = f.mailer.token('reset_password')
    assert.throws(
      () => f.service.confirmVerification(result.user, { token: reset }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
    assert.throws(
      () =>
        f.service.confirmVerification(result.user, {
          token: verification,
          userId: result.user.id,
        }),
      code('INVALID_INPUT'),
    )
    await assert.rejects(
      f.service.resetPassword({ token: reset, password: 'short' }),
      code('INVALID_INPUT'),
    )
    await assert.rejects(
      f.service.resetPassword({
        token: reset,
        password: NEW_PASSWORD,
        role: 'admin',
      }),
      code('INVALID_INPUT'),
    )
    await assert.rejects(
      f.service.forgotPassword({ email: result.user.email, locale: 'de' }),
      code('INVALID_INPUT'),
    )
    f.advance(PASSWORD_RESET_TTL_MS)
    await assert.rejects(
      f.service.resetPassword({ token: reset, password: NEW_PASSWORD }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
    f.advance(VERIFICATION_TTL_MS - PASSWORD_RESET_TTL_MS)
    assert.throws(
      () => f.service.confirmVerification(result.user, { token: verification }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
  } finally {
    f.repository.close()
  }
})

test('resends have a cooldown and delivery failure preserves earlier usable links', async () => {
  const f = fixture()
  try {
    const result = await f.service.register(buyer())
    const first = f.mailer.token('verify_email')
    await assert.rejects(
      f.service.requestVerification(result.user, { locale: 'ru' }),
      code('RATE_LIMITED'),
    )
    f.advance(AUTH_MAIL_COOLDOWN_MS)
    f.mailer.fail = true
    await assert.rejects(
      f.service.requestVerification(result.user, { locale: 'kk' }),
      code('MAIL_UNAVAILABLE'),
    )
    const failed = f.mailer.token('verify_email')
    assert.notEqual(first, failed)
    assert.throws(
      () => f.service.confirmVerification(result.user, { token: failed }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
    assert.deepEqual(
      f.service.confirmVerification(result.user, { token: first }),
      { verified: true },
    )
    assert.equal(
      f.repository.db.prepare('SELECT count(*) AS total FROM auth_tokens').get()
        ?.total,
      0,
    )
  } finally {
    f.repository.close()
  }
})

test('account creation survives unavailable mail and configured recovery never discloses account existence or delivery failure', async () => {
  const f = fixture()
  try {
    f.mailer.ready = false
    const result = await f.service.register(buyer())
    assert.equal(result.verificationEmailSent, false)
    assert.equal(f.service.session(result.token)?.id, result.user.id)
    const response = (email: string) =>
      f.service.forgotPassword({ email, locale: 'en' })
    for (const address of [result.user.email!, 'unknown@example.invalid'])
      await assert.rejects(response(address), code('MAIL_UNAVAILABLE'))
    f.mailer.ready = true
    f.mailer.fail = true
    assert.deepEqual(await response(result.user.email!), { accepted: true })
    assert.deepEqual(await response('unknown@example.invalid'), {
      accepted: true,
    })
    assert.deepEqual(await response(result.user.email!), { accepted: true })
    assert.deepEqual(await response('unknown@example.invalid'), {
      accepted: true,
    })
    assert.equal(f.mailer.messages.length, 1)
    assert.equal(
      f.repository.db.prepare('SELECT count(*) AS total FROM auth_tokens').get()
        ?.total,
      0,
    )
  } finally {
    f.repository.close()
  }
})

test('recovery applies the same response-time floor to unknown, provider failure and cooldown requests', async () => {
  const f = fixture(':memory:', 70)
  try {
    const account = await f.service.register(buyer())
    f.mailer.fail = true
    f.mailer.sendDelayMs = 10
    const settled: boolean[] = [false, false]
    const requests = [account.user.email!, 'unknown@example.invalid'].map(
      (email, index) =>
        f.service.forgotPassword({ email, locale: 'en' }).then((result) => {
          settled[index] = true
          return result
        }),
    )
    await delay(35)
    assert.deepEqual(settled, [false, false])
    assert.deepEqual(await Promise.all(requests), [
      { accepted: true },
      { accepted: true },
    ])
    let cooldownSettled = false
    const cooldown = f.service
      .forgotPassword({ email: account.user.email, locale: 'en' })
      .then(() => {
        cooldownSettled = true
      })
    await delay(35)
    assert.equal(cooldownSettled, false)
    await cooldown
  } finally {
    f.repository.close()
  }
})

test('two concurrent resets have one winner, revoke every session/token and preserve administrator grants', async () => {
  const f = fixture()
  try {
    const account = await f.service.register(buyer())
    grantAdministrator(f.repository, account.user.email!, INITIAL_TIME)
    const sessions = await Promise.all([
      f.service.login({ email: account.user.email, password: PASSWORD }),
      f.service.login({ email: account.user.email, password: PASSWORD }),
    ])
    await f.service.forgotPassword({ email: account.user.email, locale: 'ru' })
    const token = f.mailer.token('reset_password')
    const outcomes = await Promise.allSettled([
      f.service.resetPassword({ token, password: NEW_PASSWORD }),
      f.service.resetPassword({ token, password: NEW_PASSWORD }),
    ])
    assert.equal(
      outcomes.filter((result) => result.status === 'fulfilled').length,
      1,
    )
    const failure = outcomes.find((result) => result.status === 'rejected')
    assert.ok(
      failure?.status === 'rejected' &&
        code('INVALID_OR_EXPIRED_TOKEN')(failure.reason),
    )
    for (const session of sessions)
      assert.equal(f.service.session(session.token), null)
    assert.equal(
      f.repository.db.prepare('SELECT count(*) AS total FROM auth_tokens').get()
        ?.total,
      0,
    )
    assert.equal(f.repository.user(account.user.id)?.emailVerified, true)
    assert.equal(f.repository.user(account.user.id)?.role, 'admin')
    await assert.rejects(
      f.service.login({ email: account.user.email, password: PASSWORD }),
      code('INVALID_CREDENTIALS'),
    )
    const login = await f.service.login({
      email: account.user.email,
      password: NEW_PASSWORD,
    })
    assert.equal(login.user.emailVerified, true)
    assert.equal(login.user.role, 'admin')
    assert.equal(f.mailer.messages.at(-1)?.kind, 'password_changed')
    assert.ok(!JSON.stringify(f.mailer.messages).includes(NEW_PASSWORD))
  } finally {
    f.repository.close()
  }
})

test('expiry and password revision are rechecked after slow credential hashing', async () => {
  const f = fixture()
  try {
    const result = await f.service.register(buyer())
    await f.service.forgotPassword({ email: result.user.email, locale: 'en' })
    const token = f.mailer.token('reset_password')
    const pending = f.service.resetPassword({ token, password: NEW_PASSWORD })
    f.advance(PASSWORD_RESET_TTL_MS)
    await assert.rejects(pending, code('INVALID_OR_EXPIRED_TOKEN'))
    assert.equal(
      (await f.service.login({ email: result.user.email, password: PASSWORD }))
        .user.id,
      result.user.id,
    )
    const oldPasswordLogin = f.service.login({
      email: result.user.email,
      password: PASSWORD,
    })
    // Simulate the atomic password-reset commit while native scrypt is still running.
    f.repository.transaction(() => {
      f.repository.db
        .prepare(
          'UPDATE auth_state SET credential_revision=credential_revision+1 WHERE user_id=?',
        )
        .run(result.user.id)
      f.repository.db
        .prepare('DELETE FROM sessions WHERE user_id=?')
        .run(result.user.id)
    })
    await assert.rejects(oldPasswordLogin, code('INVALID_CREDENTIALS'))
    assert.equal(
      f.repository.db
        .prepare('SELECT count(*) AS total FROM sessions WHERE user_id=?')
        .get(result.user.id)?.total,
      0,
    )
  } finally {
    f.repository.close()
  }
})

test('reset notifications can fail after a committed reset without rolling back the password', async () => {
  const f = fixture()
  try {
    const result = await f.service.register(buyer())
    await f.service.forgotPassword({ email: result.user.email, locale: 'en' })
    const token = f.mailer.token('reset_password')
    f.mailer.fail = true
    assert.deepEqual(
      await f.service.resetPassword({ token, password: NEW_PASSWORD }),
      { reset: true },
    )
    assert.equal(f.service.session(result.token), null)
    assert.equal(
      (
        await f.service.login({
          email: result.user.email,
          password: NEW_PASSWORD,
        })
      ).user.emailVerified,
      true,
    )
    await assert.rejects(
      f.service.resetPassword({ token, password: NEW_PASSWORD }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
  } finally {
    f.repository.close()
  }
})

test('verification invalidates recovery links and logins already running before ownership confirmation', async () => {
  const f = fixture()
  try {
    const account = await f.service.register(buyer())
    const verification = f.mailer.token('verify_email')
    await f.service.forgotPassword({ email: account.user.email, locale: 'en' })
    const recovery = f.mailer.token('reset_password')
    const loginAlreadyRunning = f.service.login({
      email: account.user.email,
      password: PASSWORD,
    })
    f.service.confirmVerification(account.user, { token: verification })
    await assert.rejects(loginAlreadyRunning, code('INVALID_CREDENTIALS'))
    await assert.rejects(
      f.service.resetPassword({ token: recovery, password: NEW_PASSWORD }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
    assert.equal(
      f.repository.db
        .prepare('SELECT credential_revision FROM auth_state WHERE user_id=?')
        .get(account.user.id)?.credential_revision,
      2,
    )
    assert.equal(f.service.session(account.token), null)
    assert.equal(
      (await f.service.login({ email: account.user.email, password: PASSWORD }))
        .user.emailVerified,
      true,
    )
  } finally {
    f.repository.close()
  }
})

test('legacy unverified owners can pause existing offers and fulfil orders while new sales remain blocked', async () => {
  const f = fixture()
  try {
    const administrator = await f.service.register(
      buyer('admin@example.invalid'),
    )
    f.service.confirmVerification(administrator.user, {
      token: f.mailer.token('verify_email', administrator.user.email),
    })
    grantAdministrator(f.repository, administrator.user.email!, INITIAL_TIME)
    const admin = f.repository.user(administrator.user.id)!
    const owner = (await f.service.register(cafe())).user
    f.service.confirmVerification(owner, {
      token: f.mailer.token('verify_email', owner.email),
    })
    const application = f.service.merchantApplication(owner).application
    f.service.reviewVenue(admin, application.id, {
      action: 'approve',
      expectedRevision: application.revision,
    })
    const source = f.service.getOffer('goa-surprise').offer
    const {
      title,
      kind,
      description,
      guarantee,
      allergens,
      price,
      originalPrice,
      totalQuantity,
      image,
      pickupStart,
      pickupEnd,
      translations,
    } = source
    const offer = f.service.createOffer(owner, {
      title,
      kind,
      description,
      guarantee,
      allergens,
      price,
      originalPrice,
      totalQuantity,
      image,
      pickupStart,
      pickupEnd,
      translations,
    }).offer
    const account = await f.service.register(buyer())
    f.service.confirmVerification(account.user, {
      token: f.mailer.token('verify_email', account.user.email),
    })
    const order = f.service.reserve(account.user, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'existing-order-1',
    }).order
    const confirmed = f.service.confirm(account.user, order.id, {
      idempotencyKey: 'confirm-existing-order-1',
    }).order
    const hold = f.service.reserve(account.user, {
      offerId: offer.id,
      quantity: 1,
      idempotencyKey: 'existing-order-2',
    }).order
    // A pre-verification deployment can contain approved cafes and active orders for unverified accounts.
    f.repository.db
      .prepare('UPDATE auth_state SET verified_at=NULL WHERE user_id IN (?,?)')
      .run(owner.id, account.user.id)
    assert.equal(f.service.merchant(owner).orders.length, 2)
    assert.equal(f.service.listOrders(account.user).orders.length, 2)
    assert.equal(
      f.service.patchOffer(owner, offer.id, { status: 'paused' }).offer.status,
      'paused',
    )
    assert.throws(
      () => f.service.patchOffer(owner, offer.id, { status: 'published' }),
      code('EMAIL_NOT_VERIFIED'),
    )
    assert.throws(
      () =>
        f.service.patchOffer(owner, offer.id, { status: 'paused', price: 900 }),
      code('EMAIL_NOT_VERIFIED'),
    )
    assert.throws(
      () =>
        f.service.confirm(account.user, hold.id, {
          idempotencyKey: 'confirm-existing-order-2',
        }),
      code('EMAIL_NOT_VERIFIED'),
    )
    assert.equal(
      f.service.cancel(account.user, hold.id).order.status,
      'cancelled',
    )
    assert.equal(
      f.service.lookupPickup(owner, confirmed.pickupCode).order.id,
      confirmed.id,
    )
    assert.equal(
      f.service.collect(owner, {
        code: confirmed.pickupCode,
        idempotencyKey: 'fulfil-existing-order-1',
      }).order.status,
      'collected',
    )
  } finally {
    f.repository.close()
  }
})

test('email ownership gates new sales and private moderation regardless of forged client claims', async () => {
  const f = fixture()
  try {
    const account = await f.service.register(buyer())
    const spoof = {
      ...account.user,
      emailVerified: true,
      role: 'admin' as const,
    }
    assert.throws(
      () =>
        f.service.reserve(spoof, {
          offerId: 'goa-surprise',
          quantity: 1,
          idempotencyKey: 'unverified-attempt-1',
        }),
      code('EMAIL_NOT_VERIFIED'),
    )
    assert.deepEqual(f.service.listOrders(account.user).orders, [])
    grantAdministrator(f.repository, account.user.email!, INITIAL_TIME)
    assert.throws(
      () => f.service.listVenueApplications(spoof),
      code('EMAIL_NOT_VERIFIED'),
    )
    assert.throws(
      () => f.service.getVenueApplication(spoof, 'goa-food'),
      code('EMAIL_NOT_VERIFIED'),
    )
    const token = f.mailer.token('verify_email', account.user.email)
    f.service.confirmVerification(account.user, { token })
    const admin = f.repository.user(account.user.id)!
    assert.ok(f.service.listVenueApplications(admin).venues.length >= 3)
    const owner = (await f.service.register(cafe())).user
    const application = f.service.merchantApplication(owner).application
    f.service.reviewVenue(admin, application.id, {
      action: 'approve',
      expectedRevision: application.revision,
    })
    const source = f.service.getOffer('goa-surprise').offer
    const offerInput = { ...source, idempotencyKey: 'unverified-offer-1' }
    // Offer input cannot carry DTO fields, so take only accepted values.
    const {
      title,
      kind,
      description,
      guarantee,
      allergens,
      price,
      originalPrice,
      totalQuantity,
      image,
      pickupStart,
      pickupEnd,
      translations,
      idempotencyKey,
    } = offerInput
    assert.throws(
      () =>
        f.service.createOffer(
          { ...owner, emailVerified: true },
          {
            title,
            kind,
            description,
            guarantee,
            allergens,
            price,
            originalPrice,
            totalQuantity,
            image,
            pickupStart,
            pickupEnd,
            translations,
            idempotencyKey,
          },
        ),
      code('EMAIL_NOT_VERIFIED'),
    )
    f.service.confirmVerification(owner, {
      token: f.mailer.token('verify_email', owner.email),
    })
    const published = f.service.createOffer(owner, {
      title,
      kind,
      description,
      guarantee,
      allergens,
      price,
      originalPrice,
      totalQuantity,
      image,
      pickupStart,
      pickupEnd,
      translations,
      idempotencyKey,
    }).offer
    assert.ok(
      f.service.listOffers().offers.some((item) => item.id === published.id),
    )
  } finally {
    f.repository.close()
  }
})

test('email token state, cooldown and verification survive reopening SQLite', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ostatki-email-persist-'))
  const path = join(dir, 'test.sqlite')
  let repository: Repository | undefined
  try {
    const first = fixture(path)
    repository = first.repository
    const result = await first.service.register(buyer())
    const token = first.mailer.token('verify_email')
    repository.close()
    repository = undefined
    const second = fixture(path)
    repository = second.repository
    assert.equal(second.repository.user(result.user.id)?.emailVerified, false)
    await assert.rejects(
      second.service.requestVerification(result.user, { locale: 'en' }),
      code('RATE_LIMITED'),
    )
    assert.deepEqual(
      second.service.confirmVerification(result.user, { token }),
      { verified: true },
    )
    assert.equal(second.service.session(result.token), null)
    repository.close()
    repository = undefined
    const third = fixture(path)
    repository = third.repository
    assert.equal(third.repository.user(result.user.id)?.emailVerified, true)
    assert.throws(
      () => third.service.confirmVerification(result.user, { token }),
      code('INVALID_OR_EXPIRED_TOKEN'),
    )
  } finally {
    repository?.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mail requests enforce persistent per-address and global bounds without exposing tokens over HTTP', async () => {
  const f = fixture()
  try {
    for (let attempt = 0; attempt < 5; attempt++)
      await f.service.forgotPassword({
        email: 'unknown@example.invalid',
        locale: 'en',
      })
    await assert.rejects(
      f.service.forgotPassword({
        email: 'unknown@example.invalid',
        locale: 'en',
      }),
      code('RATE_LIMITED'),
    )
    f.advance(15 * 60_000)
    for (let attempt = 0; attempt < 30; attempt++)
      await f.service.forgotPassword({
        email: `unknown${attempt}@example.invalid`,
        locale: 'en',
      })
    await assert.rejects(
      f.service.forgotPassword({
        email: 'fresh@example.invalid',
        locale: 'en',
      }),
      code('RATE_LIMITED'),
    )
    f.advance(60_000)
    const account = await f.service.register(buyer())
    const verification = f.mailer.token('verify_email')
    const req = new Request(
      'https://food.example/api/auth/verification/confirm',
      {
        method: 'POST',
        headers: {
          origin: 'https://food.example',
          'content-type': 'application/json',
          cookie: `ostatki_session=${account.token}`,
        },
        body: JSON.stringify({ token: verification }),
      },
    )
    const response = await endpoint(
      req,
      true,
      async ({ service, user }) =>
        json(service.confirmVerification(user, await readJson(req)), 200, {
          'Set-Cookie': sessionCookie(req, null),
        }),
      f.service,
    )
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { verified: true })
    assert.match(response.headers.get('set-cookie')!, /Max-Age=0; Secure$/)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(f.service.session(account.token), null)
  } finally {
    f.repository.close()
  }
})
