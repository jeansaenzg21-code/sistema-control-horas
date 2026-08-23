type ActivityListener = () => void

const globalForEvents = globalThis as unknown as {
  __pcActivityListeners?: Map<number, Set<ActivityListener>>
}

const listeners: Map<number, Set<ActivityListener>> =
  globalForEvents.__pcActivityListeners ?? new Map()
globalForEvents.__pcActivityListeners = listeners

export function subscribeActivityChanges(
  usuarioId: number,
  listener: ActivityListener,
): () => void {
  let set = listeners.get(usuarioId)
  if (!set) {
    set = new Set()
    listeners.set(usuarioId, set)
  }
  set.add(listener)
  return () => {
    const s = listeners.get(usuarioId)
    if (!s) return
    s.delete(listener)
    if (s.size === 0) listeners.delete(usuarioId)
  }
}

export function notifyActivityChange(usuarioId: number): void {
  const set = listeners.get(usuarioId)
  if (!set) return
  for (const listener of set) {
    try {
      listener()
    } catch {}
  }
}

type AuthListener = (tipo: 'login' | 'logout') => void

const globalForAuthEvents = globalThis as unknown as {
  __pcAuthListeners?: Set<AuthListener>
}

const authListeners: Set<AuthListener> =
  globalForAuthEvents.__pcAuthListeners ?? new Set()
globalForAuthEvents.__pcAuthListeners = authListeners

export function subscribeAuthChanges(listener: AuthListener): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

export function notifyAuthChange(tipo: 'login' | 'logout'): void {
  for (const listener of authListeners) {
    try {
      listener(tipo)
    } catch {}
  }
}
