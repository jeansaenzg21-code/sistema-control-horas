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

// --- cambios en la cartera de clientes ------------------------------------
//
// Crear, editar o borrar un cliente cambia la cartera: /api/clientes/cartera
// devuelve filas distintas. Esa respuesta la guardan en su propio estado los
// componentes que la pintan (el panel del jefe, la pantalla /clientes), y
// ninguno de ellos se enteraba del alta: `cargarClientes` refresca /api/clientes,
// que es otra lista con otras cifras. El cliente nuevo quedaba fuera de pantalla
// hasta recargar la página a mano.
//
// Este aviso cierra ese hueco: quien escribe emite, quien lee la cartera se
// suscribe y vuelve a pedirla. Va en globalThis por la misma razón que los de
// actividad: en desarrollo el HMR recrea los módulos y unos listeners colgando
// de un Map viejo no se vuelven a disparar.

type ClientesListener = () => void

const globalForClientesEvents = globalThis as unknown as {
  __pcClientesListeners?: Set<ClientesListener>
}

const clientesListeners: Set<ClientesListener> =
  globalForClientesEvents.__pcClientesListeners ?? new Set()
globalForClientesEvents.__pcClientesListeners = clientesListeners

export function subscribeClientesChanges(listener: ClientesListener): () => void {
  clientesListeners.add(listener)
  return () => {
    clientesListeners.delete(listener)
  }
}

export function notifyClientesChange(): void {
  for (const listener of clientesListeners) {
    try {
      listener()
    } catch {}
  }
}
