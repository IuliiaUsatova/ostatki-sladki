type Loader = (url: string, signal: AbortSignal) => Promise<unknown>

type PendingRead = {
  controller: AbortController
  promise: Promise<unknown>
  subscribers: number
  settled: boolean
}

function aborted(): DOMException {
  return new DOMException('Read subscription released', 'AbortError')
}

/** Shares only pending reads; each consumer owns its cancellation. */
export function createResourceReadPool(loader: Loader) {
  const pending = new Map<string, PendingRead>()

  function invalidate(url?: string): void {
    // Existing subscribers finish independently; later reads must see fresh data.
    if (url === undefined) pending.clear()
    else pending.delete(url)
  }

  function read<T>(url: string): {
    promise: Promise<T>
    release: () => void
  } {
    let entry = pending.get(url)
    if (!entry) {
      const controller = new AbortController()
      const created: PendingRead = {
        controller,
        subscribers: 0,
        settled: false,
        promise: Promise.resolve().then(() => {
          if (controller.signal.aborted) throw aborted()
          return loader(url, controller.signal)
        }),
      }
      const settle = () => {
        created.settled = true
        if (pending.get(url) === created) pending.delete(url)
      }
      void created.promise.then(settle, settle)
      pending.set(url, created)
      entry = created
    }
    const current = entry
    current.subscribers++
    let released = false
    let rejectSubscription: (reason: unknown) => void = () => {}
    const promise = new Promise<T>((resolve, reject) => {
      rejectSubscription = reject
      void current.promise.then(
        (value) => {
          if (!released) resolve(value as T)
        },
        (error: unknown) => {
          if (!released) reject(error)
        },
      )
    })
    return {
      promise,
      release() {
        if (released) return
        released = true
        rejectSubscription(aborted())
        current.subscribers--
        if (current.subscribers === 0 && !current.settled) {
          if (pending.get(url) === current) pending.delete(url)
          current.controller.abort()
        }
      },
    }
  }

  return { read, invalidate }
}
