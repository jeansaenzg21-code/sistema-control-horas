'use client'

/**
 * Unico cliente de API para la WEB.
 *
 * La web ya no guarda el token en localStorage: vive en una cookie HttpOnly que
 * el navegador envia solo. Por eso este cliente hace dos cosas:
 *
 *   1. Manda `credentials: 'same-origin'` para que la cookie viaje en cada
 *      peticion.
 *   2. No pone ninguna cabecera `Authorization`: el token no sale del servidor.
 *
 * La app movil y el widget de escritorio siguen usando Bearer y su propio
 * almacenamiento (shared/src/api.ts y timer/src/App.tsx). Este cliente es solo
 * para el navegador.
 */

export class ApiError extends Error {
  status: number
  codigo?: string

  constructor(status: number, mensaje: string, codigo?: string) {
    super(mensaje)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
  }
}

export interface OpcionesApi {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

/**
 * Opciones de fetch listas para usar, con la cookie de sesion incluida.
 *
 * `Content-Type` se anade solo cuando hay cuerpo, para no mandar una cabecera
 * vacia en los GET.
 */
export function opcionesApi(opciones: OpcionesApi = {}): RequestInit {
  const { method = 'GET', body, headers = {}, signal } = opciones
  return {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  }
}

function mensajePorEstado(status: number): string {
  switch (status) {
    case 400:
      return 'La solicitud no es valida.'
    case 401:
      return 'Tu sesion ha expirado. Vuelve a iniciar sesion.'
    case 403:
      return 'No tienes permiso para hacer esta accion.'
    case 404:
      return 'No se encontro lo que buscas.'
    case 409:
      return 'Los datos cambiaron. Recarga e intenta de nuevo.'
    case 429:
      return 'Demasiadas peticiones. Espera un momento.'
    default:
      return 'Ocurrio un error inesperado.'
  }
}

/**
 * Peticion tipica: devuelve el JSON ya parseado o lanza `ApiError`.
 *
 * Centraliza el manejo de errores para que todos los componentes vean el mismo
 * mensaje y el mismo codigo de estado.
 */
export async function apiFetch<T>(ruta: string, opciones: OpcionesApi = {}): Promise<T> {
  const res = await fetch(ruta, opcionesApi(opciones))

  if (!res.ok) {
    const datos = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
    throw new ApiError(res.status, datos.error || mensajePorEstado(res.status), datos.code)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
