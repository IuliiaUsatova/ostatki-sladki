import { Repository } from '../src/server/repository.ts'
import { databasePath } from '../src/server/database-path.ts'
import { createOrderMailer } from '../src/server/order-mail.ts'
import { createNotificationWorker } from '../src/server/notification-worker.ts'

const INTERVAL_MS = 15_000
let repository: Repository
try {
  repository = new Repository(databasePath(), Date.now())
} catch {
  console.error('Order notifications could not open their persistent storage.')
  process.exit(1)
}
const worker = createNotificationWorker(repository, {
  mailer: createOrderMailer(),
})
let stopping = false
let running: Promise<void> | undefined

function tick() {
  if (stopping || running) return
  running = worker
    .tick()
    .then(
      () => {},
      () => {
        // Never log provider bodies, recipient addresses, order payloads or credentials.
        console.error(
          'Order notifications could not complete a background check.',
        )
      },
    )
    .finally(() => {
      running = undefined
    })
}
const timer = setInterval(tick, INTERVAL_MS)
tick()

async function stop() {
  if (stopping) return
  stopping = true
  clearInterval(timer)
  await running
  repository.close()
}
process.once('SIGINT', () => {
  void stop()
})
process.once('SIGTERM', () => {
  void stop()
})
