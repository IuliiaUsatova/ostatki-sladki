import { parentPort, workerData } from 'node:worker_threads'
import { Repository } from '../src/server/repository.ts'
import { MarketplaceService } from '../src/server/service.ts'
import { SEED_USERS } from '../src/server/seed.ts'
import { DomainError } from '../src/domain/errors.ts'

const repository = new Repository(workerData.path, workerData.now, {
  seedFixtures: true,
})
const service = new MarketplaceService(repository, () => workerData.now, {
  allowPersonaSessions: true,
})
try {
  const result = service.reserve(SEED_USERS.buyer, {
    offerId: 'goa-surprise',
    quantity: 1,
    idempotencyKey: workerData.key,
  })
  parentPort?.postMessage({ status: 'reserved', id: result.order.id })
} catch (error) {
  if (!(error instanceof DomainError)) throw error
  parentPort?.postMessage({ status: error.code })
} finally {
  repository.close()
}
