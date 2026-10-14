import { Repository } from './repository.ts'
import { MarketplaceService } from './service.ts'
import { databasePath } from './database-path.ts'
import { createAuthMailer } from './mail.ts'

const runtime = globalThis as typeof globalThis & {
  ostatkiService?: MarketplaceService
}

export function getService(): MarketplaceService {
  runtime.ostatkiService ??= new MarketplaceService(
    new Repository(databasePath(), Date.now()),
    Date.now,
    { mailer: createAuthMailer() },
  )
  return runtime.ostatkiService
}
