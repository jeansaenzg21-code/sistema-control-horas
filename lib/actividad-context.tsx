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
import { esJefeDeArea } from './permisos'

export interface Actividad {
  id: number
  usuario_id: number
  cliente_id: number | null
  proyecto_id?: number | null
  proyecto_nombre?: string | null
  tipo_actividad_id: number
  descripcion: string | null
  facturable: boolean | null
  inicio: string
  fin: string | null
  duracion_segundos: number | null
  pausa_acumulada_segundos: number
  estado: 'EN_CURSO' | 'PAUSADA' | 'PENDIENTE_APROBACION' | 'CORRECCION_SOLICITADA' | 'APROBADA' | 'RECHAZADA'
  revisado_por: number | null
  revisado_en: string | null
  observacion_revision: string | null
  created_at: string
  usuario_nombre?: string
  cargo?: string | null
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
  tiempoPausaMs: number | null
  configurarAlertas: (minutos: number) => void
  iniciarActividad: (datos: { usuario_id: number; tipo_actividad_id: number; cliente_id?: number | null; proyecto_id?: number | null; descripcion?: string; facturable?: boolean | null }) => Promise<{ ok: boolean; error?: string }>
  pausarActividad: () => Promise<void>
  reanudarActividad: () => Promise<void>
  finalizarActividad: () => Promise<void>
  continuarActividad: () => void
  cargarActividadActual: (usuarioId: number) => Promise<Actividad | null>
  cargarHistorial: (usuarioId: number, soloPropias?: boolean) => Promise<void>
}

const ActividadContext = createContext<ActividadContextValue | null>(null)

export function ActivityProvider({ children }: { children: ReactNode }) {
  const { usuario, empresaActiva } = useAuth()
  const empresaId = empresaActiva?.id ?? null
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
  const [tiempoPausaMs, setTiempoPausaMs] = useState<number | null>(null)
  const actividadRef = useRef<Actividad | null>(null)
  const inicioRef = useRef<number>(Date.now())
  const cargaInicialRef = useRef(false)

  const getHeaders = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [])

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
    if (!empresaId) return null
    const esCargaInicial = !cargaInicialRef.current
    if (esCargaInicial) setCargandoActividad(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      const res = await fetch(`/api/actividades?usuario_id=${usuarioId}&estado=EN_CURSO`, { headers })
      if (res.ok) {
        const data = await res.json()
        const primera = data[0] as Actividad | undefined
        if (primera && (primera.estado === 'EN_CURSO' || primera.estado === 'PAUSADA')) {
          setActividadActual(primera)
          setTiempoPausaMs(null)
          return primera
        }
        const res2 = await fetch(`/api/actividades?usuario_id=${usuarioId}&estado=PAUSADA`, { headers })
        if (res2.ok) {
          const data2 = await res2.json()
          const actividad = (data2.length > 0 ? data2[0] : null) as Actividad | null
          setActividadActual(actividad)
          if (actividad) {
            const dur = Number(actividad.duracion_segundos || 0)
            const pausas = Number(actividad.pausa_acumulada_segundos || 0)
            setTiempoPausaMs(Math.max(0, (dur - pausas) * 1000))
          } else {
            setTiempoPausaMs(null)
          }
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
  }, [empresaId])

  const cargarHistorial = useCallback(async (usuarioId: number, soloPropias = true) => {
    if (!empresaId) {
      setHistorial([])
      return
    }
    try {
      let url = '/api/actividades'
      if (soloPropias) {
        url = `/api/actividades?usuario_id=${usuarioId}`
      }
      const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        const data = await res.json()
        setHistorial(data)
      }
    } catch {
      setHistorial([])
    }
  }, [empresaId])

  useEffect(() => {
    if (usuario && empresaId) {
      cargaInicialRef.current = false
      const esAdminOSupervisor = usuario.rol === 'admin' || usuario.rol === 'supervisor' || esJefeDeArea(usuario)
      Promise.all([
        cargarActividadActual(usuario.id),
        cargarHistorial(usuario.id, !esAdminOSupervisor),
      ])
    } else {
      setActividadActual(null)
      setHistorial([])
      setCargandoActividad(false)
    }
  }, [usuario, empresaId, cargarActividadActual, cargarHistorial])

  useEffect(() => {
    if (!usuario || !empresaId) return
    const esAdminOSupervisor = usuario.rol === 'admin' || usuario.rol === 'supervisor' || esJefeDeArea(usuario)
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    const es = new EventSource(`/api/actividades/stream?usuario_id=${usuario.id}&token=${encodeURIComponent(token || '')}`)
    es.addEventListener('activity-changed', () => {
      cargarActividadActual(usuario.id)
      cargarHistorial(usuario.id, !esAdminOSupervisor)
    })
    return () => es.close()
  }, [usuario, empresaId, cargarActividadActual, cargarHistorial])

  const configurarAlertas = useCallback((minutos: number) => {
    setAlertasCada(minutos)
  }, [])

  const iniciarActividad = useCallback(async (datos: { usuario_id: number; tipo_actividad_id: number; cliente_id?: number | null; proyecto_id?: number | null; descripcion?: string; facturable?: boolean | null }) => {
    if (!empresaId) return { ok: false, error: 'No hay una empresa activa.' }
    try {
      const res = await fetch('/api/actividades', {
        method: 'POST',
        headers: getHeaders(),
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
  }, [empresaId, getHeaders])

  const pausarActividad = useCallback(async () => {
    if (!usuario) return
    const actual = actividadRef.current ?? (await cargarActividadActual(usuario.id))
    if (!actual) return
    try {
      const res = await fetch(`/api/actividades/${actual.id}/pausar`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ usuario_id: usuario.id }),
      })
      if (!res.ok) {
        console.warn('[actividad] No se pudo pausar:', res.status)
        return
      }
      const elapsed = Math.max(0, Date.now() - new Date(actual.inicio).getTime())
      const pausas = (actual.pausa_acumulada_segundos || 0) * 1000
      setTiempoPausaMs(Math.max(0, elapsed - pausas))
      setActividadActual((prev) => prev ? {
        ...prev,
        estado: 'PAUSADA',
      } : null)
      setAlertaVisible(false)
    } catch {
      console.warn('[actividad] Sin conexión al pausar')
    }
  }, [usuario, cargarActividadActual, getHeaders])

  const reanudarActividad = useCallback(async () => {
    if (!usuario) return
    const actual = actividadRef.current ?? (await cargarActividadActual(usuario.id))
    if (!actual) return
    try {
      const res = await fetch(`/api/actividades/${actual.id}/continuar`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ usuario_id: usuario.id }),
      })
      if (!res.ok) {
        console.warn('[actividad] No se pudo reanudar:', res.status)
        return
      }
      setTiempoPausaMs(null)
      setActividadActual((prev) => prev ? { ...prev, estado: 'EN_CURSO' } : null)
      inicioRef.current = Date.now()
      setAlertaVisible(false)
    } catch {
      console.warn('[actividad] Sin conexión al reanudar')
    }
  }, [usuario, cargarActividadActual, getHeaders])

  const finalizarActividad = useCallback(async () => {
    if (!usuario) return
    const actual = actividadRef.current ?? (await cargarActividadActual(usuario.id))
    if (!actual) return
    try {
      const res = await fetch(`/api/actividades/${actual.id}/finalizar`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ usuario_id: usuario.id }),
      })
      if (!res.ok) {
        console.warn('[actividad] No se pudo finalizar:', res.status)
        return
      }
      setTiempoPausaMs(null)
      setActividadActual(null)
      setAlertaVisible(false)
       const esAdminOSupervisor = usuario.rol === 'admin' || usuario.rol === 'supervisor' || esJefeDeArea(usuario)
       await cargarHistorial(usuario.id, !esAdminOSupervisor)
    } catch {
      console.warn('[actividad] Sin conexión al finalizar')
    }
  }, [usuario, cargarActividadActual, cargarHistorial, getHeaders])

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
        tiempoPausaMs,
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
