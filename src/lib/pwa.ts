import { registerSW } from 'virtual:pwa-register'

type RefreshListener = (available: boolean) => void

const listeners = new Set<RefreshListener>()
let refreshAvailable = false
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined

export function registerAppServiceWorker() {
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      refreshAvailable = true
      listeners.forEach((listener) => listener(true))
    },
  })
}

export function subscribeToAppUpdate(listener: RefreshListener) {
  listeners.add(listener)
  listener(refreshAvailable)
  return () => { listeners.delete(listener) }
}

export async function applyAppUpdate() {
  await updateServiceWorker?.(true)
}
