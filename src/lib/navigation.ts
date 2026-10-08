import { useSyncExternalStore } from 'react'

const roots = new Set(['home', 'setup', 'study', 'libraries', 'archive', 'stats', 'settings'])
const positions = new Map<string, number>()
let initialized = false
let currentRoute = 'home'
const eventName = 'a4:navigate'

export function readPageRoute() {
  const route = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '')
  return roots.has(route.split('/')[0]) ? route : 'home'
}

function initializeNavigation() {
  if (initialized) return
  initialized = true
  currentRoute = readPageRoute()
  window.history.replaceState({ ...window.history.state, a4Trail: window.history.state?.a4Trail ?? [] }, '', `#/${currentRoute}`)
  window.history.scrollRestoration = 'manual'
}

function subscribe(callback: () => void) {
  initializeNavigation()
  const update = () => {
    const nextRoute = readPageRoute()
    if (nextRoute !== currentRoute) {
      positions.set(currentRoute, window.scrollY)
      currentRoute = nextRoute
      window.requestAnimationFrame(() => window.scrollTo({ top: positions.get(nextRoute) ?? 0, behavior: 'instant' }))
    }
    callback()
  }
  window.addEventListener('popstate', update)
  window.addEventListener('hashchange', update)
  window.addEventListener(eventName, update)
  return () => {
    window.removeEventListener('popstate', update)
    window.removeEventListener('hashchange', update)
    window.removeEventListener(eventName, update)
  }
}

export function goToPage(route: string, replace = false) {
  initializeNavigation()
  if (!roots.has(route.split('/')[0]) || route === readPageRoute()) return
  positions.set(readPageRoute(), window.scrollY)
  const trail: string[] = window.history.state?.a4Trail ?? []
  const state = { ...window.history.state, a4Trail: replace ? trail : [...trail, readPageRoute()] }
  window.history[replace ? 'replaceState' : 'pushState'](state, '', `#/${route}`)
  window.dispatchEvent(new Event(eventName))
}

export function goBackPage(fallback: string) {
  if ((window.history.state?.a4Trail?.length ?? 0) > 0) window.history.back()
  else goToPage(fallback, true)
}

export function goToParentPage(parent: string) {
  const trail: string[] = window.history.state?.a4Trail ?? []
  const index = trail.lastIndexOf(parent)
  if (index >= 0) window.history.go(index - trail.length)
  else goToPage(parent, true)
}

export function usePageRoute() {
  return useSyncExternalStore(subscribe, readPageRoute, () => 'home')
}
