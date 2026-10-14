import type { Order } from '../../../domain/types.ts'
import type { Repository } from '../../repository.ts'
import type { SqliteOrderCommands } from '../../infrastructure/sqlite/order-commands.ts'
import type { Authorization } from '../authorization/service.ts'
import type { MarketplaceWork } from '../marketplace/work.ts'

type OrderDependencies = {
  authorization: Authorization
  work: MarketplaceWork
  clock: () => number
  recordNotifications: (
    order: Order,
    event: 'confirmed' | 'cancelled' | 'collected' | 'not_collected',
    now: number,
  ) => void
}

export type BuyerOrderDependencies = OrderDependencies & {
  repository: Pick<
    Repository,
    'offer' | 'venue' | 'order' | 'orders' | 'orderByCode'
  >
  commands: Pick<
    SqliteOrderCommands,
    'count' | 'insertReserved' | 'confirm' | 'cancelByBuyer'
  >
}

export type MerchantOrderDependencies = OrderDependencies & {
  repository: Pick<
    Repository,
    'offer' | 'offers' | 'orders' | 'orderIssues' | 'order' | 'orderByCode'
  >
  commands: Pick<SqliteOrderCommands, 'cancelByCafe' | 'collect'>
  pauseOffer: (id: string, venueId: string) => void
}
