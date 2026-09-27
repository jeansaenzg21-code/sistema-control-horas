'use client'

/**
 * Cliente de Server-Sent Events con reconexion controlada.
 *
 * Por que no basta con `new EventSource(...)`:
 *
 * 1. El navegador reconecta solo cada 3 s (lo que diga el `retry:` del servidor)
 *    y para siempre. Si el backend esta caido, son 20 handshakes por minuto y por
 *    pestana, cada uno abriendo y cerrando una conexion en el servidor. Con 200
 *    usuarios se convierte en una tormenta de conexiones. Aqui hay un tope
 *    creciente con variacion aleatoria.
 *
 * 2. Si se abre una conexion nueva sin cerrar la anterior, quedan dos streams
 *    vivos para el mismo usuario: la misma actividad se notifica dos veces y la
 *    anterior se queda occupying memoria hasta que el servidor la caduque. Aqui
 *    solo puede haber una.
 *
 * 3. No hay forma de detectar desde codigo si el stream esta "sano" mas alla de
 *    `onopen`. Se expone el estado para que quien lo use pueda activar una
 *    consulta periodica de seguridad SOLO cuando no hay conexion.
 */

export type EstadoStream = 'conectando' | 'conectado' | 'reconectando' | 'cerrado'

export type OpcionesStream = {
  url: string
  /** Nombre de los eventos a escuchar. `message` se escucha siempre. */
  eventos?: string[]
  alEvento: (nombre: string) => void
  alEstado?: (estado: EstadoStream) => void
  /** Espera inicial al reintentar. */
  baseEsperaMs?: number
  /** Tope del espera entre reintentos. */
  esperaMaximaMs?: number
}

export type ControlStream = {
  cerrar: () => void
  estado: () => EstadoStream
  /** Fuerza un reintento inmediato. Util al volver a primer plano. */
  reconectar: () => void
  /** Conexiones abiertas creadas en total. Sirve para detectar duplicados. */
  conexionesCreadas: () => number
}

export function crearStreamSse(opciones: OpcionesStream): ControlStream {
  const base = opciones.baseEsperaMs ?? 2000
  const tope = opciones.esperaMaximaMs ?? 60_000
  const eventos = opciones.eventos ?? []

  let fuente: EventSource | null = null
  let temporizador: ReturnType<typeof setTimeout> | null = null
  let estado: EstadoStream = 'conectando'
  let intento = 0
  let abiertas = 0
  let cerrado = false

  const avisar = (nuevo: EstadoStream) => {
    estado = nuevo
    opciones.alEstado?.(nuevo)
  }

  const pararTemporizador = () => {
    if (temporizador) {
      clearTimeout(temporizador)
      temporizador = null
    }
  }

  // Cierra SIEMPRE la anterior antes de abrir otra. Sin esto, cada reconexion
  // deja un stream huérfano colgando en el servidor.
  const cerrarFuente = () => {
    if (fuente) {
      try {
        fuente.close()
      } catch {}
      fuente = null
    }
  }

  const abrir = () => {
    if (cerrado) return
    cerrarFuente()
    avisar(intento === 0 ? 'conectando' : 'reconectando')
    // token en la query? NO. La cookie HttpOnly la envia el navegador sola en
    // las peticiones del mismo origen, tambien en un EventSource. Asi el token
    // deja de aparecer en los logs de Nginx, en el historial y en el Referer.
    const nuevo = new EventSource(opciones.url)
    fuente = nuevo

    nuevo.onopen = () => {
      if (cerrado || fuente !== nuevo) return
      intento = 0
      avisar('conectado')
    }

    nuevo.onerror = () => {
      if (cerrado || fuente !== nuevo) return
      // El navegador reintentaria solo con su propio `retry`. Se cierra aqui y
      // se Decide cuando volver, con espera creciente y algo de azar para que
      // 200 usuarios que se caeran a la vez no vuelvan a la vez.
      cerrarFuente()
      avisar('reconectando')
      intento += 1
      const espera = Math.min(tope, base * 2 ** Math.min(intento, 10))
      // +-25% de dispersion.
      const jitter = espera * 0.25 * (Math.random() * 2 - 1)
      pararTemporizador()
      temporizador = setTimeout(abrir, Math.max(500, Math.round(espera + jitter)))
    }

    const manejar = (nombre: string) => () => {
      if (cerrado || fuente !== nuevo) return
      opciones.alEvento(nombre)
    }

    nuevo.addEventListener('message', manejar('message'))
    for (const nombre of eventos) {
      nuevo.addEventListener(nombre, manejar(nombre))
    }

    abiertas += 1
  }

  // Al volver a primer plano o recuperar la red se reintenta ya, sin esperar el
  // temporizador: el usuario esta mirando la pantalla en ese momento.
  const alVolver = () => {
    if (cerrado) return
    if (estado === 'conectado') return
    pararTemporizador()
    intento = 0
    abrir()
  }

  if (typeof window !== 'undefined') {
    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('online', alVolver)
    window.addEventListener('focus', alVolver)
  }

  abrir()

  return {
    cerrar: () => {
      cerrado = true
      pararTemporizador()
      cerrarFuente()
      avisar('cerrado')
      if (typeof window !== 'undefined') {
        document.removeEventListener('visibilitychange', alVolver)
        window.removeEventListener('online', alVolver)
        window.removeEventListener('focus', alVolver)
      }
    },
    estado: () => estado,
    reconectar: () => {
      if (cerrado) return
      pararTemporizador()
      intento = 0
      abrir()
    },
    conexionesCreadas: () => abiertas,
  }
}
