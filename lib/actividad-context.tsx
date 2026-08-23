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
import { useAuth } from './auth-context'

export interface Actividad {
  id: number
  usuario_id: number
  cliente_id: number | null
  tipo_actividad_id: number
  descripcion: string | null
  facturable: boolean | null
  inicio: string
  fin: string | null
  duracion_segundos: number | null
  pausa_acumulada_segundos: number
  estado: 'EN_CURSO' | 'PAUSADA' | 'PENDIENTE_APROBACION' | 'APROBADA' | 'RECHAZADA'
  revisado_por: number | null
  revisado_en: string | null
  observacion_revision: string | null
  created_at: string
  usuario_nombre?: string
  especialidad?: string
  tipo_actividad_nombre?: string
  area_nombre?: string
  area_id?: number | null
  cliente_nombre?: string
}

interface ActividadContextValue {
  actividadActual: Actividad | null
  cargandoActividad: boolean
  historial: Actividad[]
  alertasCada: number
  alertaVisible: boolean
  configurarAlertas: (minutos: number) => void
  iniciarActividad: (datos: { usuario_id: number; tipo_actividad_id: number; cliente_id?: number | null; descripcion?: string; facturable?: boolean | null }) => Promise<{ ok: boolean; error?: string }>
  pausarActividad: () => Promise<void>
  reanudarActividad: () => Promise<void>
  finalizarActividad: () => Promise<void>
  continuarActividad: () => void
  cargarActividadActual: (usuarioId: number) => Promise<Actividad | null>
  cargarHistorial: (usuarioId: number, soloPropias?: boolean) => Promise<void>
}

const ActividadContext = createContext<ActividadContextValue | null>(null)

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()
  const [actividadActual, setActividadActual] = useState<Actividad | null>(null)
  const [cargandoActividad, setCargandoActividad] = useState(true)
  const [historial, setHistorial] = useState<Actividad[]>([])
  const [alertasCada, setAlertasCada] = useState(() => {
    if (typeof window !== 'undefined') {
      const guardado = localStorage.getItem('pc_alertas_cada')
      if (guardado === '15' || guardado === '30') return Number(guardado)
    }
    return 15
  })
  const [alertaVisible, setAlertaVisible] = useState(false)
  const actividadRef = useRef<Actividad | null>(null)
  const inicioRef = useRef<number>(Date.now())
  const cargaInicialRef = useRef(false)

  useEffect(() => {
    actividadRef.current = actividadActual
    if (actividadActual && actividadActual.estado === 'EN_CURSO') {
      inicioRef.current = Date.now()
    }
  }, [actividadActual])

  useEffect(() => {
    localStorage.setItem('pc_alertas_cada', String(alertasCada))
  }, [alertasCada])

  const cargarActividadActual = useCallback(async (usuarioId: number): Promise<Actividad | null> => {
    const esCargaInicial = !cargaInicialRef.current
    if (esCargaInicial) setCargandoActividad(true)
    try {
      const res = await fetch(`/api/actividades?usuario_id=${usuarioId}&estado=EN_CURSO`)
      if (res.ok) {
        const data = await res.json()
        if (data.length > 0) {
          setActividadActual(data[0])
          return data[0] as Actividad
        }
        const res2 = await fetch(`/api/actividades?usuario_id=${usuarioId}&estado=PAUSADA`)
        if (res2.ok) {
          const data2 = await res2.json()
          const actividad = (data2.length > 0 ? data2[0] : null) as Actividad | null
          setActividadActual(actividad)
          return actividad
        }
      }
    } catch {
      // Sin conexión
    } finally {
      if (esCargaInicial) {
        cargaInicialRef.current = true
        setCargandoActividad(false)
      }
    }
    return null
  }, [])

  const cargarHistorial = useCallback(async (usuarioId: number, soloPropias = true) => {
    try {
      let url = '/api/actividades'
      if (soloPropias) {
        url = `/api/actividades?usuario_id=${usuarioId}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setHistorial(data)
      }
    } catch {
      // Sin conexión
    }
  }, [])

  useEffect(() => {
    if (usuario) {
      cargaInicialRef.current = false
      const esAdminOSupervisor = usuario.rol === 'admin' || usuario.rol === 'supervisor'
      Promise.all([
        cargarActividadActual(usuario.id),
        cargarHistorial(usuario.id, !esAdminOSupervisor),
      ])
    }
  }, [usuario, cargarActividadActual, cargarHistorial])

  useEffect(() => {
    if (!usuario) return
    const esAdminOSupervisor = usuario.rol === 'admin' || usuario.rol === 'supervisor'
    const es = new EventSource(`/api/actividades/stream?usuario_id=${usuario.id}`)
    es.addEventListener('activity-changed', () => {
      cargarActividadActual(usuario.id)
      cargarHistorial(usuario.id, !esAdminOSupervisor)
    })
    return () => es.close()
  }, [usuario, cargarActividadActual, cargarHistorial])

  const configurarAlertas = useCallback((minutos: number) => {
    setAlertasCada(minutos)
  }, [])

  const iniciarActividad = useCallback(async (datos: { usuario_id: number; tipo_actividad_id: number; cliente_id?: number | null; descripcion?: string; facturable?: boolean | null }) => {
    try {
      const res = await fetch('/api/actividades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      const data = await res.json()
      if (!res.ok) {
        return { ok: false, error: data.error || 'Error al crear actividad.' }
      }
      setActividadActual(data.actividad)
      setAlertaVisible(false)
      return { ok: true }
    } catch {
      return { ok: false, error: 'No se pudo conectar al servidor.' }
    }
  }, [])

  const pausarActividad = useCallback(async () => {
    if (!usuario) return
    const actual = actividadRef.current ?? (await cargarActividadActual(usuario.id))
    if (!actual) return
    try {
      const res = await fetch(`/api/actividades/${actual.id}/pausar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id }),
      })
      if (!res.ok) {
        console.warn('[actividad] No se pudo pausar:', res.status)
        return
      }
      const duracionHastaPausa = Math.max(
        0,
        Math.floor((Date.now() - new Date(actual.inicio).getTime()) / 1000),
      )
      setActividadActual((prev) => prev ? {
        ...prev,
        estado: 'PAUSADA',
        duracion_segundos: duracionHastaPausa,
      } : null)
      setAlertaVisible(false)
    } catch {
      console.warn('[actividad] Sin conexión al pausar')
    }
  }, [usuario, cargarActividadActual])

  const reanudarActividad = useCallback(async () => {
    if (!usuario) return
    const actual = actividadRef.current ?? (await cargarActividadActual(usuario.id))
    if (!actual) return
    try {
      const res = await fetch(`/api/actividades/${actual.id}/continuar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id }),
      })
      if (!res.ok) {
        console.warn('[actividad] No se pudo reanudar:', res.status)
        return
      }
      setActividadActual((prev) => prev ? { ...prev, estado: 'EN_CURSO' } : null)
      inicioRef.current = Date.now()
      setAlertaVisible(false)
    } catch {
      console.warn('[actividad] Sin conexión al reanudar')
    }
  }, [usuario, cargarActividadActual])

  const finalizarActividad = useCallback(async () => {
    if (!usuario) return
    const actual = actividadRef.current ?? (await cargarActividadActual(usuario.id))
    if (!actual) return
    try {
      const res = await fetch(`/api/actividades/${actual.id}/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario_id: usuario.id }),
      })
      if (!res.ok) {
        console.warn('[actividad] No se pudo finalizar:', res.status)
        return
      }
      setActividadActual(null)
      setAlertaVisible(false)
       const esAdminOSupervisor = usuario.rol === 'admin' || usuario.rol === 'supervisor'
       await cargarHistorial(usuario.id, !esAdminOSupervisor)
    } catch {
      console.warn('[actividad] Sin conexión al finalizar')
    }
  }, [usuario, cargarActividadActual, cargarHistorial])

  const continuarActividad = useCallback(() => {
    setAlertaVisible(false)
    if (actividadRef.current) {
      inicioRef.current = Date.now()
    }
  }, [])

  useEffect(() => {
    if (!actividadActual || actividadActual.estado !== 'EN_CURSO') return
    if (alertaVisible) return

    const comprobar = () => {
      const ahora = Date.now()
      if (ahora - inicioRef.current >= alertasCada * 60 * 1000) {
        setAlertaVisible(true)
      }
    }

    const intervalo = window.setInterval(comprobar, 15_000)
    comprobar()
    return () => window.clearInterval(intervalo)
  }, [actividadActual, alertaVisible, alertasCada])

  return (
    <ActividadContext.Provider
      value={{
        actividadActual,
        cargandoActividad,
        historial,
        alertasCada,
        alertaVisible,
        configurarAlertas,
        iniciarActividad,
        pausarActividad,
        reanudarActividad,
        finalizarActividad,
        continuarActividad,
        cargarActividadActual,
        cargarHistorial,
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
