import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readEmailLink } from '../src/shared/lib/email-link/index.ts'

test('email links read only one opaque token and supported locale from their fragment', () => {
  const token = 'A'.repeat(43)
  assert.deepEqual(readEmailLink(`#token=${token}&lang=kk`), {
    token,
    locale: 'kk',
    status: 'ready',
  })
  assert.deepEqual(readEmailLink(''), {
    token: null,
    locale: null,
    status: 'missing',
  })
  assert.equal(readEmailLink(`#token=${token}&lang=invalid`).locale, null)
  for (const fragment of [
    `#token=${token}&token=${token}`,
    '#token=too-short',
    '#token=' + 'A'.repeat(44),
    `#token=${token}&next=https://example.com`,
    `#token=${token}&lang=ru&lang=kk`,
    '#token=' + 'A'.repeat(42) + '/',
  ]) {
    const result = readEmailLink(fragment)
    assert.equal(result.status, 'invalid')
    assert.equal(result.token, null)
  }
})
