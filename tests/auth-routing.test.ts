import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  authDestination,
  merchantOrderPath,
  supportCasePath,
} from '../src/shared/lib/auth-routing/index.ts'
import type { User } from '../src/shared/api/contracts.ts'

const buyer: User = {
  id: 'buyer-test',
  name: 'Test',
  role: 'buyer',
  venueId: null,
}
test('authentication return paths stay local and respect account roles', () => {
  assert.equal(
    authDestination(buyer, '/offers/a-real-offer'),
    '/offers/a-real-offer',
  )
  assert.equal(authDestination(buyer, '/orders/order-123'), '/orders/order-123')
  assert.equal(authDestination(buyer, '/verify-email'), '/verify-email')
  for (const role of ['buyer', 'cafe', 'pickup', 'admin'] as const)
    assert.equal(
      authDestination({ ...buyer, role }, '/notifications'),
      '/notifications',
    )
  for (const destination of [
    'https://example.com',
    '//example.com',
    '/\\example.com',
    '/admin',
    '/merchant',
    '/orders/../admin',
    '/orders\n/evil',
    '/notifications/../admin',
    '/notifications?next=https://example.com',
  ])
    assert.equal(authDestination(buyer, destination), '/')
  assert.equal(
    authDestination({ ...buyer, role: 'admin' }, '/offers/food'),
    '/admin',
  )
  assert.equal(
    authDestination({ ...buyer, role: 'cafe' }, '/orders'),
    '/merchant',
  )
  const merchantOrder = '/merchant?order=71a171a4-b9e1-4274-9f52-053bf65e5fef'
  assert.equal(
    merchantOrderPath('71a171a4-b9e1-4274-9f52-053bf65e5fef'),
    merchantOrder,
  )
  for (const unsafe of [
    null,
    '',
    '../admin',
    'https://example.com',
    '71a171a4-b9e1-4274-9f52-053bf65e5fef&next=//example.com',
    '71a171a4-b9e1-4274-9f52-053bf65e5fef#admin',
  ])
    assert.equal(merchantOrderPath(unsafe), '/merchant')
  for (const role of ['cafe', 'pickup'] as const) {
    assert.equal(
      authDestination({ ...buyer, role }, merchantOrder),
      merchantOrder,
    )
    assert.equal(
      authDestination({ ...buyer, role }, '/merchant?order=../admin'),
      '/merchant',
    )
    assert.equal(
      authDestination(
        { ...buyer, role },
        `${merchantOrder}&next=https://example.com`,
      ),
      '/merchant',
    )
  }
  assert.equal(authDestination(buyer, merchantOrder), '/')
})

test('admin support return links retain only a canonical case ID and cannot redirect or grant another role access', () => {
  const caseId = '71a171a4-b9e1-4274-9f52-053bf65e5fef'
  const destination = '/admin/support?case=' + caseId
  assert.equal(supportCasePath(caseId), destination)
  assert.equal(
    authDestination({ ...buyer, role: 'admin' }, destination),
    destination,
  )
  assert.equal(
    authDestination({ ...buyer, role: 'admin' }, '/admin/support'),
    '/admin/support',
  )
  for (const unsafe of [
    '../admin',
    caseId + '&next=//evil.example',
    caseId + '#redirect',
    '',
    'https://example.com',
  ]) {
    assert.equal(supportCasePath(unsafe), '/admin/support')
    assert.equal(
      authDestination(
        { ...buyer, role: 'admin' },
        '/admin/support?case=' + unsafe,
      ),
      '/admin',
    )
  }
  for (const role of ['buyer', 'cafe', 'pickup'] as const)
    assert.equal(
      authDestination({ ...buyer, role }, destination),
      role === 'buyer' ? '/' : '/merchant',
    )
})

test('email preferences return path permits only the exact local profile section for every account role', () => {
  for (const role of ['buyer', 'cafe', 'pickup', 'admin'] as const) {
    const user = { ...buyer, role }
    const home =
      role === 'admin' ? '/admin' : role === 'buyer' ? '/' : '/merchant'
    assert.equal(
      authDestination(user, '/profile#email-updates'),
      '/profile#email-updates',
    )
    for (const unsafe of [
      '/profile',
      '/profile#other',
      '/profile#EMAIL-UPDATES',
      '/profile#email-updates#other',
      '/profile#email-updates?next=https://evil.example',
      '/profile?next=https://evil.example#email-updates',
      '/profile%23email-updates',
      '/profile/#email-updates',
      '/profile/../admin#email-updates',
      'https://evil.example/profile#email-updates',
      '//evil.example/profile#email-updates',
      '/\\evil.example/profile#email-updates',
      '/profile#email-updates\n',
      '/profile#email-updates\u007f',
    ])
      assert.equal(authDestination(user, unsafe), home, `${role}: ${unsafe}`)
  }
})
