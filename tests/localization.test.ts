import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Locale } from '../src/shared/api/index.transport.ts'
import { messages } from '../src/shared/i18n/messages.ts'
import { merchantMessages } from '../src/entities/venue/model/merchant/messages.ts'
import { authMessages } from '../src/_pages/auth/model/messages.ts'
import { adminMessages } from '../src/entities/venue/model/moderation/messages.ts'
import { applicationMessages } from '../src/features/cafe-application/model/applicationMessages.ts'
import { lifecycleMessages } from '../src/features/account-security/model/lifecycleMessages.ts'
import { venueMessages } from '../src/entities/venue/model/messages.ts'
import { profileReviewMessages } from '../src/entities/venue/model/profileReviewMessages.ts'
import { notificationMessages } from '../src/entities/notification/model/messages.ts'
import { orderLifecycleMessages } from '../src/entities/order/model/messages.ts'
import { supportMessages } from '../src/entities/support-case/model/messages.ts'
import { caseStatusMessages } from '../src/entities/support-case/model/status-messages.ts'
import { supportAdminMessages } from '../src/_pages/support/model/messages.ts'
import { nearbyMessages } from '../src/_pages/nearby/model/messages.ts'
import { mapMessages } from '../src/shared/ui/map/messages.ts'

test('all UI dictionaries have complete RU/KK/EN messages with matching placeholders', () => {
  const dictionaries: Array<Record<Locale, Record<string, string>>> = [
    messages,
    merchantMessages,
    authMessages,
    adminMessages,
    applicationMessages,
    lifecycleMessages,
    venueMessages,
    profileReviewMessages,
    notificationMessages,
    orderLifecycleMessages,
    supportMessages,
    caseStatusMessages,
    supportAdminMessages,
    nearbyMessages,
    mapMessages,
  ]
  for (const dictionary of dictionaries) {
    const keys = Object.keys(dictionary.en).sort()
    for (const locale of ['ru', 'kk', 'en'] as const) {
      assert.deepEqual(
        Object.keys(dictionary[locale]).sort(),
        keys,
        `Missing ${locale} messages`,
      )
      for (const key of keys) {
        const text = dictionary[locale][key]
        assert.ok(text.trim().length > 0, `${locale}.${key} is blank`)
        const placeholders = (value: string) =>
          [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
        assert.deepEqual(
          placeholders(text),
          placeholders(dictionary.en[key]),
          `${locale}.${key} placeholders`,
        )
      }
    }
  }
})
