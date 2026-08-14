export function leerStorage<T>(clave: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const valor = window.localStorage.getItem(clave)
    return valor ? (JSON.parse(valor) as T) : null
  } catch {
    return null
  }
}

export function escribirStorage(clave: string, valor: unknown) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    /* sin persistencia */
  }
}
