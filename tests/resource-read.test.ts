import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  api,
  ApiError,
  createResourceReadPool,
  resourceReads,
} from '../src/shared/api/index.transport.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function fixture() {
  const calls: Array<{
    url: string
    signal: AbortSignal
    result: ReturnType<typeof deferred<unknown>>
  }> = []
  const pool = createResourceReadPool((url, signal) => {
    const result = deferred<unknown>()
    calls.push({ url, signal, result })
    return result.promise
  })
  return { pool, calls }
}

const isAbort = (error: unknown) =>
  error instanceof Error && error.name === 'AbortError'

test('concurrent consumers of the exact same URL share one pending read, while query strings remain distinct', async () => {
  const { pool, calls } = fixture()
  const page = pool.read('/api/session')
  const shell = pool.read('/api/session')
  const english = pool.read('/api/offers?locale=en')
  const kazakh = pool.read('/api/offers?locale=kk')
  await Promise.resolve()
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/session', '/api/offers?locale=en', '/api/offers?locale=kk'],
  )
  calls[0].result.resolve({ user: { id: 'buyer-1' } })
  calls[1].result.resolve({ offers: ['English'] })
  calls[2].result.resolve({ offers: ['Kazakh'] })
  assert.deepEqual(await page.promise, await shell.promise)
  assert.deepEqual(await english.promise, { offers: ['English'] })
  assert.deepEqual(await kazakh.promise, { offers: ['Kazakh'] })
  for (const read of [page, shell, english, kazakh]) read.release()
})

test('releasing one consumer rejects only its subscription and never applies a later result to it', async () => {
  const { pool, calls } = fixture()
  const page = pool.read('/api/session')
  const shell = pool.read('/api/session')
  let pageUpdates = 0
  const pageDone = page.promise.then(
    () => pageUpdates++,
    (error) => assert.ok(isAbort(error)),
  )
  await Promise.resolve()
  page.release()
  page.release()
  assert.equal(calls[0].signal.aborted, false)
  calls[0].result.resolve({ user: null })
  assert.deepEqual(await shell.promise, { user: null })
  await pageDone
  assert.equal(pageUpdates, 0)
  shell.release()
  assert.equal(calls[0].signal.aborted, false)
})

test('the last release cancels the network and a new consumer cannot join that aborted request', async () => {
  const { pool, calls } = fixture()
  const first = pool.read('/api/session')
  const second = pool.read('/api/session')
  const firstDone = assert.rejects(first.promise, isAbort)
  const secondDone = assert.rejects(second.promise, isAbort)
  await Promise.resolve()
  first.release()
  assert.equal(calls[0].signal.aborted, false)
  second.release()
  assert.equal(calls[0].signal.aborted, true)
  await Promise.all([firstDone, secondDone])
  const replacement = pool.read('/api/session')
  await Promise.resolve()
  assert.equal(calls.length, 2)
  calls[0].result.resolve('ignored old response')
  calls[1].result.resolve('fresh response')
  assert.equal(await replacement.promise, 'fresh response')
  replacement.release()
})

test('a subscription released before dispatch never starts its loader', async () => {
  const { pool, calls } = fixture()
  const read = pool.read('/api/session')
  const done = assert.rejects(read.promise, isAbort)
  read.release()
  await done
  assert.equal(calls.length, 0)
})

test('successful and failed reads are evicted, so later consumers always retry with a new network request', async () => {
  const { pool, calls } = fixture()
  const first = pool.read('/api/orders')
  await Promise.resolve()
  calls[0].result.resolve({ orders: [] })
  await first.promise
  const second = pool.read('/api/orders')
  await Promise.resolve()
  assert.equal(calls.length, 2)
  const failed = assert.rejects(second.promise, /offline/)
  calls[1].result.reject(Error('offline'))
  await failed
  const retry = pool.read('/api/orders')
  await Promise.resolve()
  assert.equal(calls.length, 3)
  calls[2].result.resolve({ orders: ['New order'] })
  assert.deepEqual(await retry.promise, { orders: ['New order'] })
  for (const read of [first, second, retry]) read.release()
})

test('explicit reload invalidation detaches the old read without cancelling siblings or evicting its replacement', async () => {
  const { pool, calls } = fixture()
  const old = pool.read('/api/orders')
  const session = pool.read('/api/session')
  await Promise.resolve()
  pool.invalidate('/api/orders')
  const fresh = pool.read('/api/orders')
  const sessionSibling = pool.read('/api/session')
  await Promise.resolve()
  assert.deepEqual(
    calls.map((call) => call.url),
    ['/api/orders', '/api/session', '/api/orders'],
  )
  assert.equal(calls[0].signal.aborted, false)
  calls[0].result.resolve({ orders: ['Old'] })
  assert.deepEqual(await old.promise, { orders: ['Old'] })
  const freshSibling = pool.read('/api/orders')
  await Promise.resolve()
  assert.equal(calls.length, 3)
  calls[2].result.resolve({ orders: ['Fresh'] })
  calls[1].result.resolve({ user: null })
  assert.deepEqual(await fresh.promise, { orders: ['Fresh'] })
  assert.deepEqual(await freshSibling.promise, { orders: ['Fresh'] })
  await Promise.all([session.promise, sessionSibling.promise])
  for (const read of [old, fresh, freshSibling, session, sessionSibling])
    read.release()
})

test('api mutations detach reads both before dispatch and after completion; ordinary api GETs remain unpooled', async (t) => {
  const previousFetch = globalThis.fetch
  const calls: Array<{
    url: string
    method: string
    result: ReturnType<typeof deferred<Response>>
  }> = []
  globalThis.fetch = (input, init) => {
    const result = deferred<Response>()
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      result,
    })
    return result.promise
  }
  resourceReads.invalidate()
  t.after(() => {
    resourceReads.invalidate()
    globalThis.fetch = previousFetch
  })
  const original = resourceReads.read('/api/session')
  const originalSibling = resourceReads.read('/api/session')
  await Promise.resolve()
  assert.equal(calls.length, 1)
  const write = api('/api/auth/logout', { method: 'POST', body: '{}' })
  const duringWrite = resourceReads.read('/api/session')
  await Promise.resolve()
  assert.deepEqual(
    calls.map((call) => call.method),
    ['GET', 'POST', 'GET'],
  )
  calls[1].result.resolve(Response.json({ loggedOut: true }))
  await write
  const afterWrite = resourceReads.read('/api/session')
  await Promise.resolve()
  assert.equal(calls.length, 4)
  const rawFirst = api('/api/session')
  const rawSecond = api('/api/session')
  assert.equal(calls.length, 6)
  calls[0].result.resolve(Response.json({ user: { id: 'old' } }))
  calls[2].result.resolve(Response.json({ user: { id: 'during' } }))
  calls[3].result.resolve(Response.json({ user: null }))
  calls[4].result.resolve(Response.json({ user: null }))
  calls[5].result.resolve(Response.json({ user: null }))
  assert.deepEqual(await afterWrite.promise, { user: null })
  assert.deepEqual(await original.promise, { user: { id: 'old' } })
  await Promise.all([
    originalSibling.promise,
    duringWrite.promise,
    rawFirst,
    rawSecond,
  ])
  for (const read of [original, originalSibling, duringWrite, afterWrite])
    read.release()
})

test('an uncertain mutation failure also prevents a later consumer from joining a read begun during the write', async (t) => {
  const previousFetch = globalThis.fetch
  const calls: Array<ReturnType<typeof deferred<Response>>> = []
  globalThis.fetch = () => {
    const result = deferred<Response>()
    calls.push(result)
    return result.promise
  }
  resourceReads.invalidate()
  t.after(() => {
    resourceReads.invalidate()
    globalThis.fetch = previousFetch
  })
  const write = api('/api/orders/confirm', { method: 'POST', body: '{}' })
  const failed = assert.rejects(
    write,
    (error: unknown) => error instanceof ApiError && error.code === 'NETWORK',
  )
  const duringWrite = resourceReads.read('/api/orders')
  await Promise.resolve()
  calls[0].reject(Error('Response lost'))
  await failed
  const recovery = resourceReads.read('/api/orders')
  await Promise.resolve()
  assert.equal(calls.length, 3)
  calls[1].resolve(Response.json({ orders: ['Uncertain'] }))
  calls[2].resolve(Response.json({ orders: ['Authoritative'] }))
  assert.deepEqual(await recovery.promise, { orders: ['Authoritative'] })
  await duringWrite.promise
  duringWrite.release()
  recovery.release()
})
