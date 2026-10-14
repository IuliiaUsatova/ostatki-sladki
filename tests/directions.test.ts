import { test } from 'node:test'
import assert from 'node:assert/strict'
import { directionsUrl } from '../src/shared/lib/directions/index.ts'

test('directions use only a public venue destination, preserve zero coordinates and encode a missing-pin address', () => {
  const pinned = new URL(
    directionsUrl({
      address: 'Almaty',
      location: { latitude: 0, longitude: 0 },
    }),
  )
  assert.equal(pinned.origin, 'https://www.google.com')
  assert.equal(pinned.pathname, '/maps/dir/')
  assert.deepEqual(Object.fromEntries(pinned.searchParams), {
    api: '1',
    destination: '0,0',
    travelmode: 'walking',
  })
  const address = 'Алматы, Жібек жолы 42 & origin=home#private'
  const unpinned = new URL(directionsUrl({ address, location: null }))
  assert.equal(unpinned.searchParams.get('destination'), address)
  assert.equal(unpinned.searchParams.has('origin'), false)
  assert.equal(unpinned.hash, '')
})
