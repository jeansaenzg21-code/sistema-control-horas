'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Actividad, ActividadFormData } from './types'
import { calcularDuracion, formatearFecha, formatearHora, generarId } from './format'
import { leerStorage, escribirStorage } from './storage'
import { notificar, solicitarPermisoNotificaciones } from './notifications'
import { useAuth } from './auth-context'
import { useNotificaciones } from './notificaciones-context'

const CLAVE_ACTUAL = 'pc_actividad_actual'
const CLAVE_HISTORIAL = 'pc_historial'
const CLAVE_ALERTAS = 'pc_alertas_cada'

interface ActividadContextValue {
  actividadActual: Actividad | null
  historial: Actividad[]
  alertasCada: number
  alertaVisible: boolean
  configurarAlertas: (minutos: number) => void
  iniciarActividad: (datos: ActividadFormData) => void
  pausarActividad: () => void
  reanudarActividad: () => void
  finalizarActividad: () => void
  continuarActividad: () => void
  aprobarActividad: (id: string, facturable: boolean) => void
  rechazarActividad: (id: string) => void
}

const ActividadContext = createContext<ActividadContextValue | null>(null)

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { usuario, usuarios } = useAuth()
  const { agregarNotificacionAUsuario } = useNotificaciones()
  const [actividadActual, setActividadActual] = useState<Actividad | null>(null)
  const [historial, setHistorial] = useState<Actividad[]>([])
  const [alertasCada, setAlertasCada] = useState(15)
  const [alertaVisible, setAlertaVisible] = useState(false)
  const actividadRef = useRef<Actividad | null>(null)

  // Carga inicial desde localStorage
  useEffect(() => {
    setActividadActual(leerStorage(CLAVE_ACTUAL))
    const guardado = leerStorage<Actividad[]>(CLAVE_HISTORIAL) ?? []
    setHistorial(guardado.filter((a, i) => guardado.findIndex((b) => b.id === a.id) === i))
    const minutos = leerStorage<number>(CLAVE_ALERTAS)
    if (minutos === 15 || minutos === 30) setAlertasCada(minutos)
  }, [])

  // Mantiene el ref sincronizado con el estado actual
  useEffect(() => {
    actividadRef.current = actividadActual
  }, [actividadActual])

  // Persistencia
  useEffect(() => {
    escribirStorage(CLAVE_ACTUAL, actividadActual)
  }, [actividadActual])

  useEffect(() => {
    escribirStorage(CLAVE_HISTORIAL, historial)
  }, [historial])

  useEffect(() => {
    escribirStorage(CLAVE_ALERTAS, alertasCada)
  }, [alertasCada])

  const configurarAlertas = useCallback((minutos: number) => {
    setAlertasCada(minutos)
  }, [])

  const iniciarActividad = useCallback((datos: ActividadFormData) => {
    const ahora = new Date()
    const nueva: Actividad = {
      id: generarId(),
      titulo: datos.titulo,
      especialidad: datos.especialidad,
      areaId: datos.areaId ?? null,
      usuarioId: datos.usuarioId,
      usuarioNombre: datos.usuarioNombre,
      tipo: datos.tipo,
      facturable: null,
      fecha: formatearFecha(ahora),
      horaInicio: formatearHora(ahora),
      iniciadaEn: ahora.getTime(),
      acumuladoMs: 0,
      estado: 'en_curso',
    }
    setActividadActual(nueva)
    setAlertaVisible(false)
    solicitarPermisoNotificaciones()
  }, [])

  const pausarActividad = useCallback(() => {
    setActividadActual((actual) => {
      if (!actual) return actual
      const acumulado = (actual.acumuladoMs || 0) + (Date.now() - actual.iniciadaEn)
      return { ...actual, estado: 'pausada', acumuladoMs: acumulado }
    })
    setAlertaVisible(false)
  }, [])

  const reanudarActividad = useCallback(() => {
    setActividadActual((actual) => {
      if (!actual) return actual
      return { ...actual, estado: 'en_curso', iniciadaEn: Date.now() }
    })
    setAlertaVisible(false)
  }, [])

  const finalizarActividad = useCallback(() => {
    const actual = actividadRef.current
    if (!actual) return

    const horaFin = formatearHora()
    const duracion = calcularDuracion(actual.horaInicio, horaFin)
    const terminada: Actividad = {
      ...actual,
      horaFin,
      duracion,
      estado: 'pendiente_aprobacion',
    }
    setHistorial((prev) => [terminada, ...prev])
    setActividadActual(null)
    setAlertaVisible(false)

    if (usuario?.rol !== 'admin') {
      // Avisar a los administradores de que hay un registro pendiente.
      for (const admin of usuarios.filter((u) => u.rol === 'admin')) {
        agregarNotificacionAUsuario(
          admin.id,
          'Registro pendiente de aprobación',
          `${actual.usuarioNombre || usuario?.nombre || 'Un abogado'} envió: ${actual.titulo}`,
          '/aprobaciones',
        )
      }
    }
  }, [usuario, usuarios, agregarNotificacionAUsuario])

  const continuarActividad = useCallback(() => {
    setAlertaVisible(false)
    setActividadActual((actual) => {
      if (!actual) return actual
      return { ...actual, iniciadaEn: Date.now() }
    })
  }, [])

  const aprobarActividad = useCallback(
    (id: string, facturable: boolean) => {
      setHistorial((prev) => {
        const actividad = prev.find((a) => a.id === id)
        const actualizada = prev.map((a) =>
          a.id === id ? { ...a, estado: 'aprobada' as const, facturable } : a,
        )
        if (actividad?.usuarioId) {
          agregarNotificacionAUsuario(
            actividad.usuarioId,
            'Registro aprobado',
            `Tu registro "${actividad.titulo}" fue aprobado.`,
          )
        }
        return actualizada
      })
    },
    [agregarNotificacionAUsuario],
  )

  const rechazarActividad = useCallback(
    (id: string) => {
      setHistorial((prev) => {
        const actividad = prev.find((a) => a.id === id)
        const actualizada = prev.map((a) =>
          a.id === id ? { ...a, estado: 'rechazada' as const } : a,
        )
        if (actividad?.usuarioId) {
          agregarNotificacionAUsuario(
            actividad.usuarioId,
            'Registro rechazado',
            `Tu registro "${actividad.titulo}" fue rechazado.`,
          )
        }
        return actualizada
      })
    },
    [agregarNotificacionAUsuario],
  )

  // Temporizador de alertas: solo con actividad en curso y tras el intervalo configurado
  useEffect(() => {
    if (!actividadActual || actividadActual.estado !== 'en_curso') return
    if (alertaVisible) return

    const comprobar = () => {
      const ahora = Date.now()
      if (ahora - actividadActual.iniciadaEn >= alertasCada * 60 * 1000) {
        setAlertaVisible(true)
      }
    }

    const intervalo = window.setInterval(comprobar, 15_000)
    comprobar()
    return () => window.clearInterval(intervalo)
  }, [actividadActual, alertaVisible, alertasCada])

  // Notificación del navegador cuando se dispara la alerta de actividad
  useEffect(() => {
    if (!alertaVisible || !actividadActual) return
    notificar('¿Sigues trabajando?', `Paredes Cano · ${actividadActual.titulo}`)
  }, [alertaVisible, actividadActual])

  // Comandos externos (extensión de navegador) para pausar/reanudar/finalizar.
  // La extensión deja el comando en el atributo compartido data-pc-comando del
  // <html> (el DOM sí cruza entre el mundo del content script y la app), y aquí
  // se sondea cada 400ms en vez de depender de un evento, por fiabilidad.
  useEffect(() => {
    const manejarComando = () => {
      const crudo = document.documentElement.getAttribute('data-pc-comando')
      if (!crudo) return
      let detalle: { accion?: string } | undefined
      try {
        detalle = JSON.parse(crudo)
      } catch {
        detalle = undefined
      }
      if (!detalle?.accion) return
      document.documentElement.removeAttribute('data-pc-comando')
      if (detalle.accion === 'pausar') pausarActividad()
      else if (detalle.accion === 'reanudar') reanudarActividad()
      else if (detalle.accion === 'finalizar') finalizarActividad()
    }
    const intervalo = window.setInterval(manejarComando, 400)
    manejarComando()
    return () => window.clearInterval(intervalo)
  }, [pausarActividad, reanudarActividad, finalizarActividad])

  return (
    <ActividadContext.Provider
      value={{
        actividadActual,
        historial,
        alertasCada,
        alertaVisible,
        configurarAlertas,
        iniciarActividad,
        pausarActividad,
        reanudarActividad,
        finalizarActividad,
        continuarActividad,
        aprobarActividad,
        rechazarActividad,
      }}
    >
      {children}
    </ActividadContext.Provider>
  )
}

export function useActividad(): ActividadContextValue {
  const contexto = useContext(ActividadContext)
  if (!contexto) {
    throw new Error('useActividad debe usarse dentro de ActivityProvider')
  }
  return contexto
}
