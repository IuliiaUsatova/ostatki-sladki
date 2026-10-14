import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [mode = 'start', flag, suppliedPort] = process.argv.slice(2)
const port = suppliedPort === undefined ? 3103 : Number(suppliedPort)
if (
  !['dev', 'start'].includes(mode) ||
  (flag !== undefined && flag !== '--port') ||
  (flag === '--port' && suppliedPort === undefined) ||
  process.argv.length > 5 ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
) {
  console.error('Usage: node scripts/run-app.mjs dev|start [--port 3103]')
  process.exit(1)
}

const next = fileURLToPath(import.meta.resolve('next/dist/bin/next'))
const worker = fileURLToPath(
  new URL('./notification-worker.ts', import.meta.url),
)
const childEnvironment = {
  ...process.env,
  NODE_ENV: mode === 'dev' ? 'development' : 'production',
}
const children = [
  spawn(
    process.execPath,
    [next, mode, ...(mode === 'dev' ? ['--webpack'] : []), '-p', String(port)],
    { stdio: 'inherit', env: childEnvironment },
  ),
  spawn(process.execPath, [worker], {
    stdio: 'inherit',
    env: childEnvironment,
  }),
]
const closed = new Set()
let stopping = false
let forceStop

function stop(code) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) if (!closed.has(child)) child.kill('SIGTERM')
  forceStop = setTimeout(() => {
    for (const child of children) if (!closed.has(child)) child.kill('SIGKILL')
  }, 6_000)
  forceStop.unref()
}

for (const child of children) {
  child.once('error', () => {
    console.error('The application could not start one of its processes.')
    closed.add(child)
    stop(1)
  })
  child.once('exit', (code) => {
    closed.add(child)
    if (!stopping) stop(code ?? 1)
    if (closed.size === children.length && forceStop) clearTimeout(forceStop)
  })
}
process.once('SIGINT', () => stop(0))
process.once('SIGTERM', () => stop(0))
