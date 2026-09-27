'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Info,
  ListChecks,
  LockKeyhole,
  MessageSquare,
  Pencil,
  RotateCcw,
  Send,
  ShieldCheck,
  User,
  X,
  XCircle,
} from 'lucide-react'
import { useActividad, type Actividad } from '@/lib/actividad-context'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import { useClientes } from '@/lib/clientes-context'
import { datosFaltantesActividad, textoDatosFaltantes } from '@/lib/cumplimiento'
import type { ObservacionTimeline, TipoObservacion } from '@/lib/observaciones-ui'
import { esVisibleParaTrabajador, normalizarEstadoAtencion, normalizarVisibilidad } from '@/lib/observaciones-ui'
import { StatusBadge } from './status-badge'
import { FacturableBadge } from './facturable-badge'
import { cn, esFacturable, esNoFacturable, fechaLocalISO, formatHora } from '@/lib/utils'

type Filtro = 'pendientes' | 'aprobadas' | 'rechazadas' | 'correccion'
type AccionInicial = 'responder' | 'corregir' | 'reenviar' | 'rechazar' | null
type ModoDecision = 'rechazar' | 'correccion' | null

type Feedback = { tipo: 'exito' | 'error'; texto: string } | null

const etiquetas: Record<Filtro, string> = {
  pendientes: 'Pendientes',
  aprobadas: 'Aprobadas',
  rechazadas: 'Rechazadas',
  correccion: 'Corrección',
}

const iconos: Record<Filtro, React.ReactNode> = {
  pendientes: <Clock size={16} className="text-amber-400" />,
  aprobadas: <CheckCircle2 size={16} className="text-emerald-400" />,
  rechazadas: <XCircle size={16} className="text-rose-400" />,
  correccion: <RotateCcw size={16} className="text-sky-400" />,
}

const etiquetasTipo: Record<TipoObservacion, string> = {
  OBSERVACION: 'Observación',
  NOTA_INTERNA: 'Nota interna',
  SOLICITUD_CORRECCION: 'Solicitud de corrección',
  RESPUESTA: 'Respuesta',
  REENVIO: 'Reenvío',
  APROBACION: 'Aprobación',
  RECHAZO: 'Rechazo',
}

const etiquetasEstado: Record<string, string> = {
  ABIERTA: 'Pendiente',
  ATENDIDA: 'Atendida',
  RESUELTA: 'Resuelta',
}

function getHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function normalizarTimeline(valor: unknown): ObservacionTimeline[] {
  const lista = Array.isArray(valor)
    ? valor
    : valor && typeof valor === 'object' && Array.isArray((valor as Record<string, unknown>).observaciones)
      ? (valor as Record<string, unknown>).observaciones
      : []
  const salida: ObservacionTimeline[] = []
  for (const item of lista as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const fila = item as Record<string, unknown>
    const id = Number(fila.id)
    if (!Number.isInteger(id) || id <= 0) continue
    const tipo = String(fila.tipo ?? 'OBSERVACION') as TipoObservacion
    const actividadCruda = fila.actividad && typeof fila.actividad === 'object'
      ? fila.actividad as Record<string, unknown>
      : null
    const autorCrudo = fila.autor && typeof fila.autor === 'object'
      ? fila.autor as Record<string, unknown>
      : null
    salida.push({
      id,
      modulo: String(fila.modulo ?? 'APROBACIONES') === 'CUMPLIMIENTO' ? 'CUMPLIMIENTO' : 'APROBACIONES',
      actividad_id: fila.actividad_id == null ? null : Number(fila.actividad_id),
      usuario_destino_id: Number(fila.usuario_destino_id ?? 0),
      periodo_anio: fila.periodo_anio == null ? null : Number(fila.periodo_anio),
      periodo_mes: fila.periodo_mes == null ? null : Number(fila.periodo_mes),
      empresa_id: Number(fila.empresa_id ?? 0),
      visibilidad: normalizarVisibilidad(fila.visibilidad),
      tipo,
      contenido: String(fila.contenido ?? ''),
      estado_atencion: normalizarEstadoAtencion(fila.estado_atencion),
      parent_id: fila.parent_id == null ? null : Number(fila.parent_id),
      created_at: String(fila.created_at ?? ''),
      autor: autorCrudo && autorCrudo.id != null
        ? { id: Number(autorCrudo.id), nombre: String(autorCrudo.nombre ?? '') }
        : null,
      actividad: actividadCruda && actividadCruda.id != null
        ? {
            id: Number(actividadCruda.id),
            descripcion: actividadCruda.descripcion == null ? null : String(actividadCruda.descripcion),
            estado: String(actividadCruda.estado ?? ''),
            inicio: String(actividadCruda.inicio ?? ''),
            tipo_actividad: actividadCruda.tipo_actividad == null ? null : String(actividadCruda.tipo_actividad),
            cliente: actividadCruda.cliente == null ? null : String(actividadCruda.cliente),
          }
        : null,
    })
  }
  return salida.sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function agregarTimeline(actual: ObservacionTimeline[], item: ObservacionTimeline): ObservacionTimeline[] {
  const filtrado = actual.filter((observacion) => observacion.id !== item.id)
  return [...filtrado, item].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

function marcarTimelineAtendida(actual: ObservacionTimeline[], parentId: number | null): ObservacionTimeline[] {
  if (parentId == null) return actual
  return actual.map((observacion) => observacion.id === parentId
    ? { ...observacion, estado_atencion: 'ATENDIDA' }
    : observacion)
}

function errorDeRespuesta(data: unknown, fallback: string): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const valor = (data as { error?: unknown }).error
    if (typeof valor === 'string' && valor.trim()) return valor
  }
  return fallback
}

function activityPatch(actividad: Actividad, patch: Partial<Actividad>): Actividad {
  return { ...actividad, ...patch }
}

function facturableNormalizado(valor: unknown): boolean | null {
  if (esFacturable(valor)) return true
  if (esNoFacturable(valor)) return false
  return null
}

export function ApprovalList() {
  const { historial } = useActividad()
  const { areas } = useAreas()
  const { usuario } = useAuth()
  const { clientes } = useClientes()
  const esAdmin = usuario?.rol === 'admin'
  const esSupervisor = usuario?.rol === 'supervisor'
  const esPersonal = usuario?.rol === 'personal'
  const esRevisor = esAdmin || esSupervisor
  const [filtro, setFiltro] = useState<Filtro>(() => (esAdmin || esSupervisor ? 'pendientes' : 'aprobadas'))
  const [divisionId, setDivisionId] = useState<number | ''>('')
  const [detalle, setDetalle] = useState<Actividad | null>(null)
  const [detalleAccion, setDetalleAccion] = useState<AccionInicial>(null)
  const [observacionInicial, setObservacionInicial] = useState<number | null>(null)
  const [timeline, setTimeline] = useState<ObservacionTimeline[]>([])
  const [timelineCargando, setTimelineCargando] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [decisiones, setDecisiones] = useState<Record<number, boolean>>({})
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set())
  const [confirmarMasivo, setConfirmarMasivo] = useState(false)
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [cargaAprobacionesOk, setCargaAprobacionesOk] = useState(false)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [aprobaciones, setAprobaciones] = useState<Actividad[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [procesando, setProcesando] = useState<string | null>(null)
  const [detalleQuery, setDetalleQuery] = useState<{ actividad: string | null; accion: AccionInicial; observacion: string | null }>({
    actividad: null,
    accion: null,
    observacion: null,
  })
  const detalleQueryRef = useRef<string | null>(null)
  const secuenciaTimeline = useRef(0)

  const cargarAprobaciones = useCallback(async () => {
    if (!usuario) return
    setCargando(true)
    setErrorCarga(null)
    try {
      let url = '/api/aprobaciones'
      const params = new URLSearchParams()
      if (esPersonal) params.set('usuario_id', String(usuario.id))
      if (params.toString()) url += `?${params.toString()}`
      const res = await fetch(url, { headers: getHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudieron cargar las aprobaciones.'))
      if (!Array.isArray(data)) throw new Error('La respuesta de aprobaciones no es válida.')
      setAprobaciones(data as Actividad[])
      setCargaAprobacionesOk(true)
    } catch (e) {
      setCargaAprobacionesOk(false)
      setErrorCarga(e instanceof Error ? e.message : 'No se pudieron cargar las aprobaciones.')
    } finally {
      setCargando(false)
    }
  }, [usuario, esPersonal])

  useEffect(() => {
    if (!usuario) return
    if (esRevisor) {
      setFiltro((actual) => actual === 'aprobadas' ? 'pendientes' : actual)
    } else {
      setFiltro((actual) => actual === 'pendientes' ? 'aprobadas' : actual)
    }
  }, [usuario, esRevisor])

  useEffect(() => {
    setSeleccionadas(new Set())
    setModoSeleccion(false)
  }, [filtro, divisionId])

  useEffect(() => {
    void cargarAprobaciones()
  }, [cargarAprobaciones])

  const cargarTimeline = useCallback(async (actividadId: number) => {
    if (!usuario) return
    const secuencia = ++secuenciaTimeline.current
    setTimelineCargando(true)
    setTimelineError(null)
    try {
      const res = await fetch(`/api/actividades/${actividadId}/observaciones`, { headers: getHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo cargar el historial de observaciones.'))
      if (secuencia !== secuenciaTimeline.current) return
      const datos = normalizarTimeline(data)
      setTimeline(datos.filter((item) => esRevisor || (esVisibleParaTrabajador(item) && item.tipo !== 'NOTA_INTERNA')))
    } catch (e) {
      if (secuencia !== secuenciaTimeline.current) return
      setTimeline([])
      setTimelineError(e instanceof Error ? e.message : 'No se pudo cargar el historial de observaciones.')
    } finally {
      if (secuencia === secuenciaTimeline.current) setTimelineCargando(false)
    }
  }, [usuario, esRevisor])

  const abrirDetalle = useCallback((
    actividad: Actividad,
    accion: AccionInicial = null,
    observacionId: number | null = null,
  ) => {
    setDetalle(actividad)
    setDetalleAccion(accion)
    setObservacionInicial(observacionId)
    setFeedback(null)
    void cargarTimeline(actividad.id)
  }, [cargarTimeline])

  const abrirDetallePorId = useCallback(async (
    actividadId: number,
    accion: AccionInicial = null,
    observacionId: number | null = null,
  ) => {
    const local = [...aprobaciones, ...historial].find((actividad) => actividad.id === actividadId)
    if (local) {
      abrirDetalle(local, accion, observacionId)
      return
    }
    try {
      const res = await fetch(`/api/actividades/${actividadId}`, { headers: getHeaders() })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo abrir la actividad.'))
      setDetalle(data as Actividad)
      setDetalleAccion(accion)
      setObservacionInicial(observacionId)
      setFeedback(null)
      void cargarTimeline(actividadId)
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo abrir la actividad.' })
    }
  }, [aprobaciones, historial, abrirDetalle, cargarTimeline])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const accion = params.get('accion')
    setDetalleQuery({
      actividad: params.get('actividad'),
      accion: accion === 'responder' || accion === 'corregir' || accion === 'reenviar' || accion === 'rechazar' ? accion : null,
      observacion: params.get('observacion'),
    })
  }, [])

  useEffect(() => {
    if (!usuario) return
    if (!detalleQuery.actividad) {
      detalleQueryRef.current = null
      return
    }
    const id = Number(detalleQuery.actividad)
    if (!Number.isInteger(id) || id <= 0) return
    const observacionId = detalleQuery.observacion && Number(detalleQuery.observacion) > 0 ? Number(detalleQuery.observacion) : null
    const clave = `${id}:${detalleQuery.accion ?? ''}:${observacionId ?? ''}`
    if (detalleQueryRef.current === clave) return
    detalleQueryRef.current = clave
    void abrirDetallePorId(id, detalleQuery.accion, observacionId)
  }, [detalleQuery, usuario, abrirDetallePorId])

  const decisionPara = (actividad: Actividad): boolean => decisiones[actividad.id] ?? facturableNormalizado(actividad.facturable) ?? true

  const marcarFacturable = (id: number, valor: boolean) => {
    setDecisiones((prev) => ({ ...prev, [id]: valor }))
  }

  const registros = useMemo(() => {
    if (cargaAprobacionesOk) return aprobaciones
    if (esRevisor || !usuario) return historial
    return historial.filter((actividad) => actividad.usuario_id === usuario.id)
  }, [cargaAprobacionesOk, aprobaciones, historial, esRevisor, usuario])

  const todas = useMemo(() => {
    if (divisionId === '') return registros
    return registros.filter((actividad) => String(actividad.area_id) === String(divisionId))
  }, [registros, divisionId])

  const filtrosVisibles: Filtro[] = esRevisor
    ? ['pendientes', 'correccion', 'aprobadas', 'rechazadas']
    : ['correccion', 'aprobadas', 'rechazadas']

  const conteos = useMemo(() => ({
    pendientes: todas.filter((a) => a.estado === 'PENDIENTE_APROBACION').length,
    correccion: todas.filter((a) => a.estado === 'CORRECCION_SOLICITADA').length,
    aprobadas: todas.filter((a) => a.estado === 'APROBADA').length,
    rechazadas: todas.filter((a) => a.estado === 'RECHAZADA').length,
  }), [todas])

  const filtradas = todas.filter((actividad) => actividad.estado === {
    pendientes: 'PENDIENTE_APROBACION',
    correccion: 'CORRECCION_SOLICITADA',
    aprobadas: 'APROBADA',
    rechazadas: 'RECHAZADA',
  }[filtro])

  const pendientesIds = useMemo(
    () => todas.filter((actividad) => actividad.estado === 'PENDIENTE_APROBACION').map((actividad) => actividad.id),
    [todas],
  )

  const todasSeleccionadas = pendientesIds.length > 0 && pendientesIds.every((id) => seleccionadas.has(id))

  const alternarSeleccionarTodas = () => {
    setSeleccionadas(todasSeleccionadas ? new Set() : new Set(pendientesIds))
  }

  const alternarSeleccion = (id: number) => {
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  const actualizarActividad = (id: number, patch: Partial<Actividad>) => {
    setAprobaciones((prev) => prev.map((actividad) => actividad.id === id ? activityPatch(actividad, patch) : actividad))
    setDetalle((prev) => prev?.id === id ? activityPatch(prev, patch) : prev)
  }

  const manejarAprobar = async (actividad: Actividad): Promise<boolean> => {
    if (!usuario) return false
    setProcesando(`aprobar-${actividad.id}`)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          estado: 'APROBADA',
          revisado_por: usuario.id,
          facturable: decisionPara(actividad),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo aprobar la actividad.'))
      setFeedback({ tipo: 'exito', texto: 'Actividad aprobada.' })
      setDetalle(null)
      await cargarAprobaciones()
      return true
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo aprobar la actividad.' })
      return false
    } finally {
      setProcesando(null)
    }
  }

  const manejarRechazar = async (actividad: Actividad, motivo: string): Promise<boolean> => {
    if (!usuario || !motivo.trim()) return false
    setProcesando(`rechazar-${actividad.id}`)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          estado: 'RECHAZADA',
          revisado_por: usuario.id,
          observacion_revision: motivo.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo rechazar la actividad.'))
      setFeedback({ tipo: 'exito', texto: 'Actividad rechazada.' })
      setDetalle(null)
      await cargarAprobaciones()
      return true
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo rechazar la actividad.' })
      return false
    } finally {
      setProcesando(null)
    }
  }

  const solicitarCorreccion = async (actividad: Actividad, motivo: string): Promise<boolean> => {
    if (!usuario || !motivo.trim()) return false
    setProcesando(`corregir-${actividad.id}`)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}/solicitar-correccion`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ contenido: motivo.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo solicitar la corrección.'))
      const observacion = normalizarTimeline([data.observacion]).at(-1)
      if (observacion) setTimeline((prev) => agregarTimeline(prev, observacion))
      actualizarActividad(actividad.id, { estado: 'CORRECCION_SOLICITADA' })
      setFeedback({ tipo: 'exito', texto: 'Corrección solicitada al trabajador.' })
      setDetalle(null)
      await cargarAprobaciones()
      return true
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo solicitar la corrección.' })
      return false
    } finally {
      setProcesando(null)
    }
  }

  const crearNota = async (
    actividad: Actividad,
    tipo: 'OBSERVACION' | 'NOTA_INTERNA',
    contenido: string,
  ): Promise<ObservacionTimeline | null> => {
    if (!contenido.trim()) return null
    const res = await fetch(`/api/actividades/${actividad.id}/observaciones`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        tipo,
        contenido: contenido.trim(),
        visibilidad: tipo === 'NOTA_INTERNA' ? 'INTERNA' : 'TRABAJADOR',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo guardar la nota.'))
    const observacion = normalizarTimeline([data]).at(-1)
    if (observacion) setTimeline((prev) => agregarTimeline(prev, observacion))
    return observacion ?? null
  }

  const responder = async (
    actividad: Actividad,
    parentId: number,
    contenido: string,
  ): Promise<ObservacionTimeline | null> => {
    if (!contenido.trim()) return null
    const res = await fetch(`/api/actividades/${actividad.id}/observaciones`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ tipo: 'RESPUESTA', contenido: contenido.trim(), parent_id: parentId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo enviar la respuesta.'))
    const observacion = normalizarTimeline([data]).at(-1)
    if (observacion) setTimeline((prev) => agregarTimeline(marcarTimelineAtendida(prev, parentId), observacion))
    return observacion ?? null
  }

  const corregir = async (
    actividad: Actividad,
    datos: { cliente_id: number | null; descripcion: string; facturable: boolean | null; respuesta: string },
  ): Promise<boolean> => {
    setProcesando(`corregir-datos-${actividad.id}`)
    try {
      const cuerpo: Record<string, unknown> = {
        cliente_id: datos.cliente_id,
        descripcion: datos.descripcion.trim() || null,
        facturable: datos.facturable,
      }
      if (datos.respuesta.trim()) cuerpo.respuesta = datos.respuesta.trim()
      const res = await fetch(`/api/actividades/${actividad.id}/corregir`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(cuerpo),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo guardar la corrección.'))
      const observacion = normalizarTimeline([data.observacion]).at(-1)
      if (observacion) setTimeline((prev) => agregarTimeline(marcarTimelineAtendida(prev, observacion.parent_id), observacion))
      actualizarActividad(actividad.id, {
        cliente_id: datos.cliente_id,
        descripcion: datos.descripcion.trim() || null,
        facturable: datos.facturable,
      })
      setFeedback({ tipo: 'exito', texto: 'Corrección guardada. Ya puedes reenviarla.' })
      return true
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo guardar la corrección.' })
      return false
    } finally {
      setProcesando(null)
    }
  }

  const reenviar = async (actividad: Actividad, comentario: string): Promise<boolean> => {
    setProcesando(`reenviar-${actividad.id}`)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}/reenviar`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ comentario: comentario.trim() || 'Corrección guardada y reenviada.' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo reenviar la actividad.'))
      const observacion = normalizarTimeline([data.observacion]).at(-1)
      if (observacion) setTimeline((prev) => agregarTimeline(prev, observacion))
      actualizarActividad(actividad.id, { estado: 'PENDIENTE_APROBACION' })
      setFeedback({ tipo: 'exito', texto: 'Actividad reenviada a aprobación.' })
      setDetalle(null)
      await cargarAprobaciones()
      return true
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo reenviar la actividad.' })
      return false
    } finally {
      setProcesando(null)
    }
  }

  const aprobarSeleccionadas = async () => {
    if (!usuario) return
    setProcesando('masivo')
    let errorMasivo: string | null = null
    for (const id of seleccionadas) {
      const actividad = todas.find((item) => item.id === id)
      if (!actividad) continue
      try {
        const res = await fetch(`/api/actividades/${id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ estado: 'APROBADA', revisado_por: usuario.id, facturable: decisionPara(actividad) }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          errorMasivo = errorDeRespuesta(data, 'No se pudieron aprobar todas las seleccionadas.')
          break
        }
      } catch {
        errorMasivo = 'No se pudieron aprobar todas las seleccionadas.'
        break
      }
    }
    setSeleccionadas(new Set())
    setConfirmarMasivo(false)
    setProcesando(null)
    if (errorMasivo) setFeedback({ tipo: 'error', texto: errorMasivo })
    else setFeedback({ tipo: 'exito', texto: 'Actividades aprobadas.' })
    await cargarAprobaciones()
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div className={cn(
          'flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs',
          feedback.tipo === 'exito'
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
            : 'border-rose-500/30 bg-rose-500/5 text-rose-300',
        )}>
          <span>{feedback.texto}</span>
          <button type="button" onClick={() => setFeedback(null)} className="rounded p-1 hover:bg-black/10" aria-label="Cerrar mensaje"><X size={13} /></button>
        </div>
      )}

      <div className={cn('grid gap-3', filtrosVisibles.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {filtrosVisibles.map((clave) => (
          <button
            key={clave}
            onClick={() => setFiltro(clave)}
            className={cn(
              'rounded-xl border p-3 text-left transition-colors',
              filtro === clave
                ? 'border-[#7c3aed]/50 bg-[#7c3aed]/5'
                : 'border-border bg-card hover:border-[#7c3aed]/30',
            )}
          >
            <div className="mb-1 flex items-center gap-2">
              {iconos[clave]}
              <span className="text-xs text-muted-foreground">{etiquetas[clave]}</span>
            </div>
            <p className="text-xl font-bold tabular-nums text-foreground">{conteos[clave]}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
          {filtrosVisibles.map((clave) => (
            <button
              key={clave}
              onClick={() => setFiltro(clave)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                filtro === clave ? 'bg-[#7c3aed] text-white' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {etiquetas[clave]}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="filtro-division-aprobaciones" className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Building2 size={13} />
            División
          </label>
          <select
            id="filtro-division-aprobaciones"
            value={divisionId}
            onChange={(evento) => setDivisionId(evento.target.value ? Number(evento.target.value) : '')}
            className="h-9 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50"
          >
            <option value="">Todas las divisiones</option>
            {areas.filter((area) => area.activo).map((area) => (
              <option key={area.id} value={String(area.id)}>{area.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {cargando && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock size={13} className="animate-spin" />Actualizando aprobaciones...</div>
      )}
      {errorCarga && <p className="text-xs text-rose-400">{errorCarga}</p>}

      {!esRevisor && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 px-4 py-3 text-sm text-foreground">
          <Bell size={15} className="shrink-0 text-[#c4b5fd]" />
          <p>Consulta las observaciones visibles de tus registros y responde o corrija cuando corresponda.</p>
        </div>
      )}

      {esRevisor && filtro === 'pendientes' && pendientesIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
          {modoSeleccion ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={todasSeleccionadas} onChange={alternarSeleccionarTodas} className="h-4 w-4 cursor-pointer accent-[#7c3aed]" />
                Seleccionar todas las pendientes
              </label>
              <div className="flex items-center gap-2">
                <button onClick={() => { setModoSeleccion(false); setSeleccionadas(new Set()) }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-[#7c3aed]/50 hover:text-[#7c3aed]">Cancelar</button>
                <button onClick={() => setConfirmarMasivo(true)} disabled={seleccionadas.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={15} />Aprobar ({seleccionadas.size})</button>
              </div>
            </>
          ) : (
            <button onClick={() => setModoSeleccion(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"><ListChecks size={15} />Seleccionar pendientes</button>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {filtradas.length === 0 && !cargando && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">No hay registros en esta categoría.</div>
        )}
        {filtradas.map((actividad) => {
          const faltantes = datosFaltantesActividad(actividad)
          return (
            <div key={actividad.id} className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-[#7c3aed]/40">
              <div className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  {esRevisor && filtro === 'pendientes' && modoSeleccion && (
                    <input type="checkbox" checked={seleccionadas.has(actividad.id)} onChange={() => alternarSeleccion(actividad.id)} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#7c3aed]" />
                  )}
                  <div className="shrink-0 text-muted-foreground">{iconos[etiquetaPorEstado(actividad.estado)]}</div>
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-foreground">{actividad.descripcion || 'Actividad sin descripción'}</h3>
                    <p className="text-sm text-muted-foreground">{actividad.tipo_actividad_nombre || actividad.cargo || actividad.especialidad || '—'} · {actividad.cliente_nombre ? `Cliente: ${actividad.cliente_nombre} · ` : ''}{fechaLocalISO(actividad.inicio)}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><User size={12} />Enviado por: <span className="font-medium text-foreground">{actividad.usuario_nombre ?? 'Desconocido'}</span></p>
                    {faltantes.length > 0 && actividad.estado === 'PENDIENTE_APROBACION' && (
                      <p className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400" title={textoDatosFaltantes(faltantes)}><AlertTriangle size={10} /><span className="truncate">{textoDatosFaltantes(faltantes)}</span></p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
                  <div className="text-right"><p className="font-semibold text-foreground">{formatDuracion(actividad)}</p><p className="text-xs text-muted-foreground">{formatHora(actividad.inicio)} – {actividad.fin ? formatHora(actividad.fin) : '—'}</p></div>
                  <FacturableBadge valor={actividad.facturable} />
                  <StatusBadge estado={actividad.estado} />
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => abrirDetalle(actividad)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"><Eye size={14} />Ver</button>
                    {esRevisor && actividad.estado === 'PENDIENTE_APROBACION' && <button onClick={() => void manejarAprobar(actividad)} disabled={procesando === `aprobar-${actividad.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={14} />Aprobar</button>}
                    {esRevisor && actividad.estado === 'PENDIENTE_APROBACION' && <button onClick={() => abrirDetalle(actividad, 'rechazar')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/10"><XCircle size={14} />Rechazar</button>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {detalle && (
        <DetalleActividadModal
          actividad={detalle}
          esRevisor={esRevisor}
          timeline={timeline}
          timelineCargando={timelineCargando}
          timelineError={timelineError}
          accionInicial={detalleAccion}
          observacionInicial={observacionInicial}
          facturable={decisionPara(detalle)}
          clientes={clientes}
          procesando={procesando}
          feedback={feedback}
          onFacturableChange={(valor) => marcarFacturable(detalle.id, valor)}
          onCerrar={() => setDetalle(null)}
          onAprobar={() => manejarAprobar(detalle)}
          onRechazar={(motivo) => manejarRechazar(detalle, motivo)}
          onSolicitarCorreccion={(motivo) => solicitarCorreccion(detalle, motivo)}
          onCrearNota={(tipo, contenido) => crearNota(detalle, tipo, contenido)}
          onResponder={(parentId, contenido) => responder(detalle, parentId, contenido)}
          onCorregir={(datos) => corregir(detalle, datos)}
          onReenviar={(comentario) => reenviar(detalle, comentario)}
        />
      )}

      {confirmarMasivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmarMasivo(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-foreground">Aprobar actividades</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">¿Deseas aprobar {seleccionadas.size} {seleccionadas.size === 1 ? 'actividad pendiente' : 'actividades pendientes'}?</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmarMasivo(false)} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-[#7c3aed]/50">Cancelar</button>
              <button onClick={() => void aprobarSeleccionadas()} disabled={procesando === 'masivo'} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={16} />Sí, aprobar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetalleActividadModal({
  actividad,
  esRevisor,
  timeline,
  timelineCargando,
  timelineError,
  accionInicial,
  observacionInicial,
  facturable,
  clientes,
  procesando,
  feedback,
  onFacturableChange,
  onCerrar,
  onAprobar,
  onRechazar,
  onSolicitarCorreccion,
  onCrearNota,
  onResponder,
  onCorregir,
  onReenviar,
}: {
  actividad: Actividad
  esRevisor: boolean
  timeline: ObservacionTimeline[]
  timelineCargando: boolean
  timelineError: string | null
  accionInicial: AccionInicial
  observacionInicial: number | null
  facturable: boolean
  clientes: Array<{ id: number; nombre: string; area_id: number; activo: boolean }>
  procesando: string | null
  feedback: Feedback
  onFacturableChange: (valor: boolean) => void
  onCerrar: () => void
  onAprobar: () => Promise<boolean>
  onRechazar: (motivo: string) => Promise<boolean>
  onSolicitarCorreccion: (motivo: string) => Promise<boolean>
  onCrearNota: (tipo: 'OBSERVACION' | 'NOTA_INTERNA', contenido: string) => Promise<ObservacionTimeline | null>
  onResponder: (parentId: number, contenido: string) => Promise<ObservacionTimeline | null>
  onCorregir: (datos: { cliente_id: number | null; descripcion: string; facturable: boolean | null; respuesta: string }) => Promise<boolean>
  onReenviar: (comentario: string) => Promise<boolean>
}) {
  const [modoDecision, setModoDecision] = useState<ModoDecision>(null)
  const [motivo, setMotivo] = useState('')
  const [tipoNota, setTipoNota] = useState<'OBSERVACION' | 'NOTA_INTERNA'>('OBSERVACION')
  const [nota, setNota] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [clienteId, setClienteId] = useState<number | ''>(actividad.cliente_id ?? '')
  const [descripcion, setDescripcion] = useState(actividad.descripcion ?? '')
  const [facturableCorrection, setFacturableCorrection] = useState<boolean | null>(facturableNormalizado(actividad.facturable))
  const [respuestaCorreccion, setRespuestaCorreccion] = useState('')
  const [correccionGuardada, setCorreccionGuardada] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const inicializacionRef = useRef<string | null>(null)

  useEffect(() => {
    const clave = `${actividad.id}:${accionInicial ?? ''}:${observacionInicial ?? ''}`
    if (inicializacionRef.current === clave) return
    inicializacionRef.current = clave
    setModoDecision(accionInicial === 'responder' ? null : accionInicial === 'rechazar' ? 'rechazar' : accionInicial === 'reenviar' || accionInicial === 'corregir' ? 'correccion' : null)
    setMotivo('')
    setNota('')
    setRespuesta('')
    setParentId(observacionInicial)
    setCorreccionGuardada(false)
    setClienteId(actividad.cliente_id ?? '')
    setDescripcion(actividad.descripcion ?? '')
    setFacturableCorrection(facturableNormalizado(actividad.facturable))
    setRespuestaCorreccion('')
    setError(null)
  }, [actividad.id, actividad.cliente_id, actividad.descripcion, actividad.facturable, accionInicial, observacionInicial])

  useEffect(() => {
    if (parentId != null || !accionInicial || accionInicial === 'corregir' || accionInicial === 'reenviar') return
    const ultima = [...timeline].reverse().find((item) => item.visibilidad === 'TRABAJADOR' && item.tipo !== 'RESPUESTA' && item.estado_atencion === 'ABIERTA')
    if (ultima) setParentId(ultima.id)
  }, [accionInicial, parentId, timeline])

  const visibles = timeline.filter((item) => esRevisor || (esVisibleParaTrabajador(item) && item.tipo !== 'NOTA_INTERNA'))
  const puedeCorregir = !esRevisor && actividad.estado === 'CORRECCION_SOLICITADA'
  const actividadTimeline = visibles.filter((item) => item.actividad_id === actividad.id || item.actividad_id == null)
  const pendientesRespuesta = actividadTimeline.filter((item) => item.visibilidad === 'TRABAJADOR' && (item.tipo === 'OBSERVACION' || item.tipo === 'SOLICITUD_CORRECCION') && item.estado_atencion === 'ABIERTA')

  const ejecutarNota = async () => {
    if (!nota.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await onCrearNota(tipoNota, nota)
      setNota('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la nota.')
    } finally {
      setGuardando(false)
    }
  }

  const ejecutarRespuesta = async () => {
    if (!parentId || !respuesta.trim()) return
    setGuardando(true)
    setError(null)
    try {
      await onResponder(parentId, respuesta)
      setRespuesta('')
      setParentId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la respuesta.')
    } finally {
      setGuardando(false)
    }
  }

  const guardarCorreccion = async () => {
    setGuardando(true)
    setError(null)
    const ok = await onCorregir({
      cliente_id: clienteId === '' ? null : Number(clienteId),
      descripcion,
      facturable: facturableCorrection,
      respuesta: respuestaCorreccion,
    })
    setGuardando(false)
    if (ok) setCorreccionGuardada(true)
  }

  const reenviarCorreccion = async () => {
    if (!correccionGuardada) return
    setGuardando(true)
    setError(null)
    const ok = await onReenviar(respuestaCorreccion)
    setGuardando(false)
    if (ok) onCerrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-3" onClick={onCerrar}>
      <div className="flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden border border-border bg-card shadow-2xl sm:h-[min(82vh,720px)] sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed]/15 text-[#c4b5fd]"><FileText size={16} /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-foreground">{actividad.descripcion || 'Actividad sin descripción'}</h2>
                <StatusBadge estado={actividad.estado} />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{actividad.usuario_nombre ?? 'Colaborador'} · {fechaLocalISO(actividad.inicio)} · #{actividad.id}</p>
            </div>
          </div>
          <button type="button" onClick={onCerrar} className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Cerrar detalle"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="px-3 py-3 sm:px-4">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <DatoGrupo etiqueta="Tipo" valor={actividad.tipo_actividad_nombre || '—'} />
              <DatoGrupo etiqueta="Cliente" valor={actividad.cliente_nombre || 'Sin cliente'} />
              <DatoGrupo etiqueta="Horario / Duración" valor={`${formatHora(actividad.inicio)} – ${actividad.fin ? formatHora(actividad.fin) : '—'} · ${formatDuracion(actividad)}`} />
            </div>

            <div className="mb-3 rounded-lg border border-border bg-muted/20 p-2.5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-medium text-foreground">Historial de observaciones</p><p className="text-[11px] text-muted-foreground">{visibles.length} evento(s) visible(s)</p></div>
                {esRevisor && timeline.some((item) => item.visibilidad === 'INTERNA') && <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"><LockKeyhole size={10} />Incluye notas internas</span>}
              </div>
              {timelineCargando ? (
                <div className="mt-2.5 space-y-2"><div className="h-12 animate-pulse rounded-lg bg-muted/70" /><div className="h-12 animate-pulse rounded-lg bg-muted/70" /></div>
              ) : timelineError ? (
                <p className="mt-2.5 text-[11px] text-rose-400">{timelineError}</p>
              ) : visibles.length === 0 ? (
                <p className="mt-2.5 rounded-lg border border-dashed border-border px-2.5 py-3 text-center text-[11px] text-muted-foreground">No hay observaciones registradas.</p>
              ) : (
                <ol className="relative mt-2.5 ml-1 border-l border-border pl-4">
                  {visibles.map((item) => (
                    <li key={item.id} className="relative pb-2.5 last:pb-0">
                      <span className={cn('absolute -left-[1.45rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-card', item.visibilidad === 'INTERNA' ? 'border-amber-500/40 text-amber-400' : 'border-[#7c3aed]/40 text-[#c4b5fd]')}>
                        {item.visibilidad === 'INTERNA' ? <LockKeyhole size={10} /> : item.tipo === 'RESPUESTA' ? <Send size={10} /> : <FileText size={10} />}
                      </span>
                      <div className="rounded-lg border border-border bg-background/50 px-2.5 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#7c3aed]/15 text-[9px] font-semibold text-[#c4b5fd]">{(item.autor?.nombre || 'A').charAt(0).toUpperCase()}</span>
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-semibold text-foreground">{item.autor?.nombre || 'Administración'}</p>
                              <p className="text-[9px] text-muted-foreground">{formatearFechaObservacion(item.created_at)}</p>
                            </div>
                          </div>
                          <span className={cn('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold', item.estado_atencion === 'ABIERTA' ? 'bg-amber-500/10 text-amber-300' : item.estado_atencion === 'ATENDIDA' ? 'bg-sky-500/10 text-sky-300' : 'bg-emerald-500/10 text-emerald-300')}>{etiquetasEstado[item.estado_atencion]}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          <span className="text-[10px] font-medium text-foreground">{etiquetasTipo[item.tipo] ?? 'Observación'}</span>
                          {item.visibilidad === 'INTERNA' && <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300"><LockKeyhole size={8} />Interna</span>}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-4 text-foreground">{item.contenido}</p>
                        {!esRevisor && (item.tipo === 'OBSERVACION' || item.tipo === 'SOLICITUD_CORRECCION') && item.estado_atencion === 'ABIERTA' && <button type="button" onClick={() => setParentId(item.id)} className="mt-1.5 text-[10px] font-medium text-[#c4b5fd] hover:text-[#a78bfa]">Responder esta observación</button>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {esRevisor && (
              <div className="rounded-lg border border-border bg-muted/20 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div><p className="text-xs font-medium text-foreground">Añadir nota</p><p className="text-[11px] text-muted-foreground">Las notas internas no se envían al trabajador.</p></div>
                  <div className="flex rounded-lg border border-border bg-card p-0.5">
                    <button type="button" onClick={() => setTipoNota('OBSERVACION')} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium', tipoNota === 'OBSERVACION' ? 'bg-sky-500/15 text-sky-300' : 'text-muted-foreground')}><Eye size={11} />Visible</button>
                    <button type="button" onClick={() => setTipoNota('NOTA_INTERNA')} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium', tipoNota === 'NOTA_INTERNA' ? 'bg-amber-500/15 text-amber-300' : 'text-muted-foreground')}><LockKeyhole size={11} />Interna</button>
                  </div>
                </div>
                <textarea value={nota} onChange={(event) => setNota(event.target.value)} rows={1} maxLength={2000} placeholder={tipoNota === 'NOTA_INTERNA' ? 'Escribe una nota interna...' : 'Escribe una observación visible...'} className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#7c3aed]/50 focus:outline-none" />
                <div className="mt-1.5 flex justify-end"><button type="button" onClick={() => void ejecutarNota()} disabled={!nota.trim() || guardando} className="inline-flex items-center gap-1 rounded-lg bg-[#7c3aed] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50"><Send size={11} />Guardar nota</button></div>
              </div>
            )}
          </section>

          <aside className="border-t border-border bg-muted/10 px-3 py-3 sm:px-4">
            {feedback && <div className={cn('mb-2 rounded-lg border px-2.5 py-1.5 text-[11px]', feedback.tipo === 'exito' ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-rose-500/30 bg-rose-500/5 text-rose-300')}>{feedback.texto}</div>}
            {error && <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2.5 py-1.5 text-[11px] text-rose-300">{error}</div>}

            {puedeCorregir ? (
              <CorrectionForm
                actividad={actividad}
                clientes={clientes}
                clienteId={clienteId}
                descripcion={descripcion}
                facturable={facturableCorrection}
                respuesta={respuestaCorreccion}
                guardada={correccionGuardada}
                guardando={guardando || procesando === `corregir-datos-${actividad.id}` || procesando === `reenviar-${actividad.id}`}
                onCliente={(valor) => { setClienteId(valor); setCorreccionGuardada(false) }}
                onDescripcion={(valor) => { setDescripcion(valor); setCorreccionGuardada(false) }}
                onFacturable={(valor) => { setFacturableCorrection(valor); setCorreccionGuardada(false) }}
                onRespuesta={(valor) => { setRespuestaCorreccion(valor); setCorreccionGuardada(false) }}
                onGuardar={() => void guardarCorreccion()}
                onReenviar={() => void reenviarCorreccion()}
              />
            ) : !esRevisor ? (
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-1.5"><MessageSquare size={14} className="text-[#c4b5fd]" /><h3 className="text-xs font-semibold text-foreground">Responder observaciones</h3></div>
                {pendientesRespuesta.length === 0 ? <p className="mt-2 text-[11px] text-muted-foreground">No tienes observaciones pendientes en esta actividad.</p> : <>
                  <p className="mt-1 text-[11px] text-muted-foreground">Selecciona una observación visible para responderla.</p>
                  <div className="mt-2 space-y-1">
                    {pendientesRespuesta.map((item) => <button type="button" key={item.id} onClick={() => setParentId(item.id)} className={cn('w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors', parentId === item.id ? 'border-[#7c3aed]/50 bg-[#7c3aed]/10 text-foreground' : 'border-border text-muted-foreground hover:border-[#7c3aed]/30')}>{item.tipo === 'SOLICITUD_CORRECCION' ? 'Solicitud de corrección' : 'Observación'} · {item.autor?.nombre || 'Administración'}</button>)}
                  </div>
                  {parentId && <div className="mt-2"><label className="mb-1 block text-[11px] font-medium text-foreground">Tu respuesta</label><textarea value={respuesta} onChange={(event) => setRespuesta(event.target.value)} rows={2} maxLength={2000} placeholder="Escribe tu respuesta..." className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground focus:border-[#7c3aed]/50 focus:outline-none" /><button type="button" onClick={() => void ejecutarRespuesta()} disabled={!respuesta.trim() || guardando} className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-[#7c3aed] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50"><Send size={11} />Enviar respuesta</button></div>}
                </>}
              </div>
            ) : (
              <DecisionPanel
                actividad={actividad}
                facturable={facturable}
                modoDecision={modoDecision}
                motivo={motivo}
                procesando={procesando}
                onFacturable={onFacturableChange}
                onModo={setModoDecision}
                onMotivo={setMotivo}
                onConfirmar={() => {
                  if (modoDecision === 'rechazar') void onRechazar(motivo)
                  else if (modoDecision === 'correccion') void onSolicitarCorreccion(motivo)
                }}
              />
            )}
          </aside>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 border-t border-border bg-card px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Info size={12} />{esRevisor ? 'La decisión y las notas quedan registradas en el historial.' : 'Sólo se muestran las observaciones visibles para ti.'}</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {esRevisor && actividad.estado === 'PENDIENTE_APROBACION' && <button type="button" onClick={() => { setModoDecision('correccion'); setMotivo('') }} className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10"><Pencil size={12} />Solicitar corrección</button>}
            {esRevisor && actividad.estado === 'PENDIENTE_APROBACION' && <button type="button" onClick={() => { setModoDecision('rechazar'); setMotivo('') }} className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"><XCircle size={12} />Rechazar</button>}
            {esRevisor && actividad.estado === 'PENDIENTE_APROBACION' && <button type="button" onClick={() => void onAprobar()} disabled={procesando === `aprobar-${actividad.id}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={12} />{procesando === `aprobar-${actividad.id}` ? 'Aprobando...' : 'Aprobar'}</button>}
            {puedeCorregir && <button type="button" onClick={() => void guardarCorreccion()} disabled={guardando} className="inline-flex items-center gap-1 rounded-lg border border-sky-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"><ShieldCheck size={12} />Guardar</button>}
            {puedeCorregir && <button type="button" onClick={() => void reenviarCorreccion()} disabled={!correccionGuardada || guardando} className="inline-flex items-center gap-1 rounded-lg bg-[#7c3aed] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-40"><Send size={12} />Reenviar</button>}
          </div>
        </footer>
      </div>
    </div>
  )
}

function CorrectionForm({
  actividad,
  clientes,
  clienteId,
  descripcion,
  facturable,
  respuesta,
  guardada,
  guardando,
  onCliente,
  onDescripcion,
  onFacturable,
  onRespuesta,
  onGuardar,
  onReenviar,
}: {
  actividad: Actividad
  clientes: Array<{ id: number; nombre: string; area_id: number; activo: boolean }>
  clienteId: number | ''
  descripcion: string
  facturable: boolean | null
  respuesta: string
  guardada: boolean
  guardando: boolean
  onCliente: (valor: number | '') => void
  onDescripcion: (valor: string) => void
  onFacturable: (valor: boolean | null) => void
  onRespuesta: (valor: string) => void
  onGuardar: () => void
  onReenviar: () => void
}) {
  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
      <div className="flex items-center gap-1.5"><RotateCcw size={14} className="text-sky-300" /><h3 className="text-xs font-semibold text-foreground">Corregir actividad</h3></div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Actualiza los datos solicitados y responde al administrador antes de reenviar.</p>
      <div className="mt-2.5 space-y-2">
        <div><label className="mb-1 block text-[11px] font-medium text-foreground">Cliente</label><select value={clienteId} onChange={(event) => onCliente(event.target.value ? Number(event.target.value) : '')} className="h-8 w-full rounded-lg border border-border bg-background px-2 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/30"><option value="">Sin cliente</option>{clientes.filter((cliente) => cliente.activo).map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre}</option>)}</select></div>
        <div><label className="mb-1 block text-[11px] font-medium text-foreground">Descripción</label><textarea value={descripcion} onChange={(event) => onDescripcion(event.target.value)} rows={2} maxLength={2000} placeholder="Describe la actividad..." className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/30" /></div>
        <div><p className="mb-1 text-[11px] font-medium text-foreground">Facturable</p><div className="flex gap-1 rounded-lg border border-border bg-background p-0.5">{([{ value: true, label: 'Sí' }, { value: false, label: 'No' }, { value: null, label: 'Por definir' }] as const).map((opcion) => <button type="button" key={opcion.label} onClick={() => onFacturable(opcion.value)} className={cn('flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium', facturable === opcion.value ? 'bg-[#7c3aed] text-white' : 'text-muted-foreground hover:text-foreground')}>{opcion.label}</button>)}</div></div>
        <div><label className="mb-1 block text-[11px] font-medium text-foreground">Respuesta al administrador</label><textarea value={respuesta} onChange={(event) => onRespuesta(event.target.value)} rows={2} maxLength={2000} placeholder="Explica los cambios realizados..." className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/30" /></div>
      </div>
      {guardada && <p className="mt-2 flex items-center gap-1 text-[10px] font-medium text-emerald-300"><CheckCircle2 size={11} />Cambios guardados. Puedes reenviar.</p>}
      <div className="mt-2.5 flex flex-col gap-1.5 sm:flex-row"><button type="button" onClick={onGuardar} disabled={guardando} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-sky-500/40 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"><ShieldCheck size={12} />{guardando ? 'Guardando...' : 'Guardar corrección'}</button><button type="button" onClick={onReenviar} disabled={!guardada || guardando} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#7c3aed] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-40"><Send size={12} />Reenviar</button></div>
      <p className="mt-1.5 text-[9px] text-muted-foreground">Actividad #{actividad.id} · estado actual: corrección solicitada.</p>
    </div>
  )
}

function DecisionPanel({
  actividad,
  facturable,
  modoDecision,
  motivo,
  procesando,
  onFacturable,
  onModo,
  onMotivo,
  onConfirmar,
}: {
  actividad: Actividad
  facturable: boolean
  modoDecision: ModoDecision
  motivo: string
  procesando: string | null
  onFacturable: (valor: boolean) => void
  onModo: (modo: ModoDecision) => void
  onMotivo: (valor: string) => void
  onConfirmar: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#c4b5fd]" /><h3 className="text-xs font-semibold text-foreground">Revisión</h3></div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Revisa la información y decide cómo continuar con esta actividad.</p>
      <div className="mt-2.5"><p className="mb-1 text-[11px] font-medium text-foreground">Facturable</p><div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-0.5"><button type="button" onClick={() => onFacturable(true)} className={cn('flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium', facturable ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:text-foreground')}>Sí</button><button type="button" onClick={() => onFacturable(false)} className={cn('flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium', !facturable ? 'bg-zinc-600 text-white' : 'text-muted-foreground hover:text-foreground')}>No</button></div></div>
      {actividad.estado === 'PENDIENTE_APROBACION' && modoDecision && <div className="mt-2.5 rounded-lg border border-border bg-muted/20 p-2.5"><label className="mb-1 block text-[11px] font-medium text-foreground">{modoDecision === 'rechazar' ? 'Motivo de rechazo' : 'Observación para corregir'}<span className="text-rose-400"> *</span></label><textarea value={motivo} onChange={(event) => onMotivo(event.target.value)} rows={2} maxLength={2000} placeholder={modoDecision === 'rechazar' ? 'Explica por qué se rechaza...' : 'Indica qué debe corregirse...'} className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-foreground focus:border-[#7c3aed]/50 focus:outline-none" /><div className="mt-1.5 flex justify-end gap-1.5"><button type="button" onClick={() => onModo(null)} className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground">Cancelar</button><button type="button" onClick={onConfirmar} disabled={!motivo.trim() || procesando != null} className={cn('rounded-md px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50', modoDecision === 'rechazar' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-sky-600 hover:bg-sky-700')}>{procesando ? 'Procesando...' : modoDecision === 'rechazar' ? 'Confirmar rechazo' : 'Enviar solicitud'}</button></div></div>}
      {actividad.estado === 'CORRECCION_SOLICITADA' && <div className="mt-2.5 rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5 text-[11px] text-sky-300">La actividad está esperando la corrección del trabajador.</div>}
      {actividad.estado === 'APROBADA' && <div className="mt-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-[11px] text-emerald-300">La actividad ya fue aprobada.</div>}
      {actividad.estado === 'RECHAZADA' && <div className="mt-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2.5 text-[11px] text-rose-300">La actividad fue rechazada y el motivo está en el historial.</div>}
      {actividad.estado === 'PENDIENTE_APROBACION' && !modoDecision && <p className="mt-2.5 text-[10px] text-muted-foreground">Usa las acciones inferiores para aprobar, solicitar corrección o rechazar.</p>}
    </div>
  )
}

function DatoGrupo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return <div className="min-w-0 rounded-lg border border-border bg-muted/20 px-2 py-1.5"><p className="text-[9px] text-muted-foreground">{etiqueta}</p><p className="mt-0.5 truncate text-[11px] font-medium text-foreground" title={valor}>{valor}</p></div>
}

function formatDuracion(a: Actividad): string {
  if (a.fin && a.inicio) {
    const inicio = new Date(a.inicio).getTime()
    const fin = new Date(a.fin).getTime()
    if (isNaN(inicio) || isNaN(fin)) return '—'
    const totalSeg = Math.floor((fin - inicio) / 1000) - (a.pausa_acumulada_segundos || 0)
    if (totalSeg <= 0) return '—'
    const h = Math.floor(totalSeg / 3600)
    const m = Math.floor((totalSeg % 3600) / 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  }
  return '—'
}

function formatearFechaObservacion(valor: string): string {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return fecha.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function etiquetaPorEstado(estado: Actividad['estado']): Filtro {
  if (estado === 'PENDIENTE_APROBACION') return 'pendientes'
  if (estado === 'CORRECCION_SOLICITADA') return 'correccion'
  if (estado === 'APROBADA') return 'aprobadas'
  return 'rechazadas'
}
