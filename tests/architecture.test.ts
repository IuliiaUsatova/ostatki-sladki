import { test } from 'node:test'
import assert from 'node:assert/strict'

type Violation = { file: string; line: number; code: string; message: string }
const { analyzeArchitecture } = (await import(
  new URL('../scripts/check-architecture.mjs', import.meta.url).href
)) as {
  analyzeArchitecture(options: {
    files: Record<string, string>
    sourceRoot?: string
  }): Violation[]
}
const codes = (files: Record<string, string>) =>
  analyzeArchitecture({ files }).map((item) => item.code)

test('lower public entries, own internals and shared/app segments are permitted', () => {
  assert.deepEqual(
    codes({
      'src/app/page.tsx': `export { Page as default } from '@/_pages/catalog'`,
      'src/app/layout.tsx': `import './globals.css'`,
      'src/app/globals.css': `body { margin: 0 }`,
      'src/_pages/catalog/index.ts': `export { Page } from './ui/Page'`,
      'src/_pages/catalog/ui/Page.tsx': `import { Card } from '@/entities/offer/index.ts'; import { api } from '../../../shared/api/index.ts'`,
      'src/entities/offer/index.ts': `export { Card } from './ui/Card'`,
      'src/entities/offer/ui/Card.tsx': `import type { Offer } from '@/shared/api'`,
      'src/shared/api/index.ts': `export type { Offer } from './contracts.ts'; export { api } from './client.ts'`,
      'src/shared/api/contracts.ts': `export interface Offer { id: string }`,
      'src/shared/api/client.ts': `import { geo } from '@/shared/lib/geo'; export const api = geo`,
      'src/shared/lib/geo/index.ts': `export const geo = 1`,
      'src/_app/providers/index.ts': `export { App } from './App'`,
      'src/_app/providers/App.tsx': `import { Theme } from '@/_app/theme'`,
      'src/_app/theme/index.ts': `export const Theme = 1`,
      'src/server/work.ts': `import { readFileSync } from 'node:fs'; import type { Offer } from '../shared/api/contracts.ts'`,
      'src/app/api/route.ts': `import '@/server/transport.ts'`,
      'src/server/transport.ts': `export const transport = 1`,
    }),
    [],
  )
})

test('upward, peer and deep imports are rejected including type-only exports and imports', () => {
  const found = codes({
    'src/entities/offer/index.ts': `export type { Page } from '@/_pages/catalog'; export { Buyer } from '@/entities/buyer'; import type { Client } from '@/shared/api/client.ts'`,
    'src/_pages/catalog/index.ts': `export interface Page {}`,
    'src/entities/buyer/index.ts': `export const Buyer = 1`,
    'src/shared/api/client.ts': `export interface Client {}`,
  })
  assert.ok(found.includes('upward-import'))
  assert.ok(found.includes('peer-import'))
  assert.ok(found.includes('public-entry'))
})

test('frontend cannot bypass backend/Node boundaries through dynamic, require or import types', () => {
  const found = codes({
    'src/features/auth/index.ts': `import type { User } from '@/server/auth.ts'; export type Value = import('@/domain/types.ts').Value; void import('node:fs'); const fs = require('fs'); void import(target); import '/outside/project.ts'`,
    'src/server/auth.ts': `export interface User {}`,
    'src/domain/types.ts': `export interface Value {}`,
  })
  assert.equal(found.filter((code) => code === 'frontend-backend').length, 2)
  assert.equal(found.filter((code) => code === 'frontend-node').length, 2)
  assert.ok(found.includes('dynamic-import'))
  assert.ok(found.includes('absolute-import'))
})

test('module/slice cycles are detected without flagging own public barrels or type-only module cycles', () => {
  assert.deepEqual(
    codes({
      'src/entities/offer/index.ts': `export { card } from './ui/card'; export type { A } from './model/a'`,
      'src/entities/offer/ui/card.ts': `import { card } from '../index.ts'; export { card }`,
      'src/entities/offer/model/a.ts': `import type { B } from './b'; export interface A { b: B }`,
      'src/entities/offer/model/b.ts': `import type { A } from './a'; export interface B { a: A }`,
    }),
    [],
  )
  assert.ok(
    codes({
      'src/features/cart/index.ts': `export { total } from './model/a'`,
      'src/features/cart/model/a.ts': `import { value } from './b'; export const total = value`,
      'src/features/cart/model/b.ts': `import { total } from './a'; export const value = total`,
    }).includes('module-cycle'),
  )
  assert.ok(
    codes({
      'src/entities/offer/index.ts': `import type { Buyer } from '@/entities/buyer'`,
      'src/entities/buyer/index.ts': `import type { Offer } from '@/entities/offer'`,
    }).includes('slice-cycle'),
  )
})

test('resolution accepts transport entries, rejects missing/canonical aliases, and ignores test fixtures', () => {
  const found = codes({
    'src/shared/lib/http/index.transport.ts': `export const http = 1`,
    'src/features/auth/index.ts': `import { http } from '@/shared/lib/http/index.transport.ts'; import '@/shared/lib/../api'; import './missing'`,
    'src/shared/api/index.ts': `export const api = 1`,
    'tests/fixture.ts': `import 'node:fs'; import '@/server/auth.ts'`,
  })
  assert.deepEqual(found.sort(), ['canonical-alias', 'unresolved-import'])
})

test('dynamic import options and JS-to-TS resolution preserve public-entry checks', () => {
  assert.deepEqual(
    codes({
      'src/_pages/catalog/index.ts': `void import('@/entities/offer/index.js', { with: { type: 'module' } })`,
      'src/entities/offer/index.ts': `export const card = 1`,
    }),
    [],
  )
  assert.deepEqual(
    codes({
      'src/_pages/catalog/index.ts': `import { card } from '@/entities/offer/ui/card.jsx'`,
      'src/entities/offer/ui/card.tsx': `export const card = 1`,
    }),
    ['public-entry'],
  )
})

test('backend cannot import frontend business slices but can use pure shared helpers', () => {
  assert.deepEqual(
    codes({
      'src/server/service.ts': `import { Card } from '@/entities/offer'; import { geo } from '../shared/lib/geo/index.ts'`,
      'src/entities/offer/index.ts': `export const Card = 1`,
      'src/shared/lib/geo/index.ts': `export const geo = 1`,
    }),
    ['backend-frontend'],
  )
})
