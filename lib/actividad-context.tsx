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
import { veActividadDeTodaLaEmpresa } from './permisos'
import { ControlStream, crearStreamSse } from './sse'

export interface Actividad {
  id: number
  usuario_id: number
  cliente_id: number | null
proyecto_id?: number | null
  proyecto_nombre?: string | null
  /** Bolsa de horas a la que se imputa la actividad. Cuelga del cliente. */
  presupuesto_servicio_id?: number | null
  presupuesto_servicio_nombre?: string | null
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
  iniciarActividad: (datos: { usuario_id: number; tipo_actividad_id: number; cliente_id?: number | null; proyecto_id?: number | null; presupuesto_servicio_id?: number | null; descripcion?: string; facturable?: boolean | null }) => Promise<{ ok: boolean; error?: string }>
  pausarActividad: () => Promise<void>
  reanudarActividad: () => Promise<void>
  finalizarActividad: () => Promise<void>
  continuarActividad: () => void
  cargarActividadActual: (usuarioId: number) => Promise<Actividad | null>
  cargarHistorial: (usuarioId: number, soloPropias?: boolean, opciones?: { append?: boolean }) => Promise<void>
  /** Total de registros del usuario segun el servidor, para los textos de la interfaz. */
  totalHistorial: number
  /** True cuando el servidor tiene mas paginas que las ya cargadas. */
  hayMasHistorial: boolean
  /** Trae la siguiente pagina del historial. */
  cargarMasHistorial: () => Promise<void>
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
// Espejo del historial en una ref: permite appendir paginas sin volver a
// renderizar y sin que la funcion dependa del estado (que la recrearia).
const historialRef = useRef<Actividad[]>([])
const [totalHistorial, setTotalHistorial] = useState(0)
const [hayMasHistorial, setHayMasHistorial] = useState(false)

// Pagina del historial. 200 filas pesan poco y se ven de un vistazo; el boton
// 'Cargar mas' trae la siguiente.
const LIMITE_PAGINA = 200

// Estado del stream de eventos. La consulta de seguridad solo se activa cuando
// NO hay conexion sana.
const [streamConectado, setStreamConectado] = useState(false)
const streamRef = useRef<ControlStream | null>(null)

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

  /**
   * Carga el historial POR PAGINAS.
   *
   * Antes descargaba la tabla entera en cada llamada, y esta funcion se dispara
   * al montar la pantalla y otra vez con cada evento SSE. Medido: el
   * administrador recibia 50 139 filas y 28 MB por respuesta, p95 de 2,6 s.
   *
   * Ahora pide una pagina de 200 y el total real viene en la cabecera
   * `X-Total`, que solo se calcula cuando ya se ha cargado al menos una pagina
   * (pedirlo en la primera costaria un COUNT sobre la tabla entera).
   */
  const cargarHistorial = useCallback(
    async (usuarioId: number, soloPropias = true, opciones: { append?: boolean } = {}) => {
      if (!empresaId) {
        if (!opciones.append) setHistorial([])
        return
      }
      const append = opciones.append === true
      const offset = append ? historialRef.current.length : 0
      try {
        // La query se arma con URLSearchParams, no concatenándola a una base a la
        // que a veces le falta el '?'.
        //
        // La versión anterior hacía `'/api/actividades' + '&limite=...'`, así que
        // quien NO ve solo sus registros (jefe de área, admin, supervisor, socio)
        // pedía `/api/actividades&limite=200&offset=0`. Sin '?' esos parámetros son
        // parte de la RUTA, la consulta llegaba vacía y Next respondía 404. El
        // fetch caía en el `!res.ok`, el historial se ponía a [] y la pestaña de
        // registros se quedaba en blanco: al finalizar una actividad, el refetch
        // fallaba igual y no aparecía nada.
        const params = new URLSearchParams({
          limite: String(LIMITE_PAGINA),
          offset: String(offset),
        })
        if (soloPropias) params.set('usuario_id', String(usuarioId))
        const url = `/api/actividades?${params.toString()}`
        const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) {
          if (!append) setHistorial([])
          return
        }
        const data = await res.json()
        const total = Number(res.headers.get('X-Total') ?? '0')
        if (append) {
          // Se ignoran filas repetidas: entre dos peticiones un SSE puede haber
          // insertado una actividad y el offset se habria desplazado.
          const vistos = new Set(historialRef.current.map((a) => a.id))
          const nuevas = (data as Actividad[]).filter((a) => !vistos.has(a.id))
          historialRef.current = [...historialRef.current, ...nuevas]
          setHistorial(historialRef.current)
        } else {
          historialRef.current = data as Actividad[]
          setHistorial(historialRef.current)
        }
        if (!append) {
          setTotalHistorial(Number(res.headers.get('X-Total') ?? String((data as Actividad[]).length)))
        } else if (total > 0) {
          setTotalHistorial(total)
        }
        setHayMasHistorial(
          (append ? historialRef.current.length : (data as Actividad[]).length) < (total || Infinity)
        )
      } catch {
        if (!append) {
          historialRef.current = []
          setHistorial([])
        }
      }
    },
    [empresaId]
  )

  /** Trae la siguiente pagina. Lo usa el botón "Cargar más registros". */
  const cargarMasHistorial = useCallback(async () => {
    if (!usuario || !empresaId || !hayMasHistorial) return
    const esAdminOSupervisor = veActividadDeTodaLaEmpresa(usuario)
    await cargarHistorial(usuario.id, !esAdminOSupervisor, { append: true })
  }, [usuario, empresaId, hayMasHistorial, cargarHistorial])

  useEffect(() => {
    if (usuario && empresaId) {
      cargaInicialRef.current = false
      const esAdminOSupervisor = veActividadDeTodaLaEmpresa(usuario)
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
    const esAdminOSupervisor = veActividadDeTodaLaEmpresa(usuario)

    const alCambiar = () => {
      void cargarActividadActual(usuario.id)
      void cargarHistorial(usuario.id, !esAdminOSupervisor)
    }

    // Sin token en la URL. La cookie HttpOnly la envia el navegador sola en las
    // peticiones del mismo origen, tambien en un EventSource. Con el token en la
    // query quedaba escrito en los logs de Nginx, en el historial y en el
    // Referer de cualquier recurso de la pagina.
    const control = crearStreamSse({
      url: `/api/actividades/stream?usuario_id=${usuario.id}`,
      eventos: ['activity-changed'],
      alEvento: (nombre) => {
        if (nombre === 'activity-changed') alCambiar()
      },
      alEstado: (nuevo) => {
        setStreamConectado(nuevo === 'conectado')
      },
    })
    streamRef.current = control

    // Red de seguridad, y SOLO cuando el stream no esta sano. Antes habia un
    // sondeo permanente ademas del SSE: cada usuarioGenerating una consulta cada
    // 30 s para enterarse de lo que el stream ya le habia dicho. Si el stream se
    // cae, se repone con un intervalo mas espaciado en vez de desaparecer.
    const seguridad = window.setInterval(() => {
      if (control.estado() === 'conectado') return
      alCambiar()
    }, 60_000)

    return () => {
      window.clearInterval(seguridad)
      control.cerrar()
      streamRef.current = null
      setStreamConectado(false)
    }
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
       const esAdminOSupervisor = veActividadDeTodaLaEmpresa(usuario)
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
    totalHistorial,
    hayMasHistorial,
    cargarMasHistorial,
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
