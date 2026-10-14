import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  requestSearchLocation,
  searchPoint,
} from '../src/shared/lib/geolocation/geolocation.ts'

const position = (
  latitude: number,
  longitude: number,
): GeolocationPosition => ({
  coords: {
    latitude,
    longitude,
    accuracy: 1,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() {
      return {}
    },
  },
  timestamp: 1,
  toJSON() {
    return {}
  },
})
const browserError = (code: number): GeolocationPositionError => ({
  code,
  message: 'Browser error',
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
})

test('geolocation passes rounded coordinates without retaining precise browser data', () => {
  let result: unknown = null
  let options: PositionOptions | undefined
  requestSearchLocation(
    {
      getCurrentPosition(success, _, settings) {
        options = settings
        success(position(43.238934567, 76.889712345))
      },
    },
    (point) => {
      result = point
    },
    () => assert.fail('Unexpected failure'),
  )
  assert.deepEqual(result, { latitude: 43.2389, longitude: 76.8897 })
  assert.equal(options?.enableHighAccuracy, false)
  assert.equal(options?.timeout, 10_000)
})

test('invalid or out-of-map browser coordinates fail without starting a search', () => {
  for (const [latitude, longitude] of [
    [NaN, 70],
    [90, 10],
    [-86, 10],
    [43, Infinity],
    [43, 181],
  ]) {
    let result = ''
    requestSearchLocation(
      {
        getCurrentPosition(success) {
          success(position(latitude, longitude))
        },
      },
      () => assert.fail('Invalid position accepted'),
      (key) => {
        result = key
      },
    )
    assert.equal(result, 'locationUnavailable')
  }
  assert.equal(searchPoint({ latitude: 90, longitude: 0 }), null)
})

test('denied, timeout and unavailable browser failures have distinct fallback messages', () => {
  for (const [code, expected] of [
    [1, 'locationDenied'],
    [2, 'locationUnavailable'],
    [3, 'locationTimeout'],
  ] as const) {
    let result = ''
    requestSearchLocation(
      {
        getCurrentPosition(_, failure) {
          failure?.(browserError(code))
        },
      },
      () => assert.fail('Unexpected success'),
      (key) => {
        result = key
      },
    )
    assert.equal(result, expected)
  }
})

test('unsupported browser and synchronous security exceptions settle the request', () => {
  for (const provider of [
    undefined,
    {
      getCurrentPosition() {
        throw new Error('SecurityError')
      },
    },
  ]) {
    let result = ''
    requestSearchLocation(
      provider,
      () => assert.fail('Unexpected success'),
      (key) => {
        result = key
      },
    )
    assert.equal(result, 'locationUnavailable')
  }
})

test('cancelled location request ignores late success and failure callbacks', () => {
  let successCallback: PositionCallback | undefined
  let failureCallback: PositionErrorCallback | null | undefined
  let callbacks = 0
  const cancel = requestSearchLocation(
    {
      getCurrentPosition(success, failure) {
        successCallback = success
        failureCallback = failure
      },
    },
    () => {
      callbacks += 1
    },
    () => {
      callbacks += 1
    },
  )
  cancel()
  successCallback?.(position(43, 76))
  failureCallback?.(browserError(3))
  assert.equal(callbacks, 0)
})

test('a completed location request settles once even if provider repeats callbacks', () => {
  let callbacks = 0
  requestSearchLocation(
    {
      getCurrentPosition(success, failure) {
        success(position(43, 76))
        success(position(40, 70))
        failure?.(browserError(3))
      },
    },
    () => {
      callbacks += 1
    },
    () => {
      callbacks += 1
    },
  )
  assert.equal(callbacks, 1)
})
