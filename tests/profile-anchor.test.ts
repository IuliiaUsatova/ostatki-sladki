import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emailPreferencesAnchorSnapshot,
  profileAnchorServerSnapshot,
  subscribeProfileAnchor,
} from '../src/shared/lib/profile-anchor/index.ts'

test('same-document hash navigation updates the exact preferences snapshot and unsubscribing stops notifications', (t) => {
  const browser = Object.assign(new EventTarget(), { location: { hash: '' } })
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: browser,
  })
  let unsubscribe = () => {}
  t.after(() => {
    unsubscribe()
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })

  const snapshots: boolean[] = []
  assert.equal(emailPreferencesAnchorSnapshot(), false)
  unsubscribe = subscribeProfileAnchor(() => {
    snapshots.push(emailPreferencesAnchorSnapshot())
  })
  for (const hash of [
    '#email-updates',
    '',
    '#other',
    '#email-updates?next=https://evil.example',
    '#EMAIL-UPDATES',
    '#email-updates',
  ]) {
    browser.location.hash = hash
    browser.dispatchEvent(new Event('hashchange'))
  }
  assert.deepEqual(snapshots, [true, false, false, false, false, true])
  unsubscribe()
  browser.location.hash = ''
  browser.dispatchEvent(new Event('hashchange'))
  assert.equal(snapshots.length, 6)
  assert.equal(emailPreferencesAnchorSnapshot(), false)
})

test('server hydration snapshot stays false without inspecting a browser location', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    get() {
      assert.fail('Server snapshot must not read window')
    },
  })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  })
  assert.equal(profileAnchorServerSnapshot(), false)
})
