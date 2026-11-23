'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  GripHorizontal,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Info,
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
import { useAuth } from '@/lib/auth-context'
import { useClientes } from '@/lib/clientes-context'
import { datosFaltantesActividad, textoDatosFaltantes } from '@/lib/cumplimiento'
import type { ObservacionTimeline, TipoObservacion } from '@/lib/observaciones-ui'
import { esVisibleParaTrabajador, normalizarEstadoAtencion, normalizarVisibilidad } from '@/lib/observaciones-ui'
import { AprobacionesAdminVista, fechaDeRegistro, type FiltroAdmin, type PeriodoAprobaciones } from './aprobaciones-admin-vista'
import { StatusBadge } from './status-badge'
import { FacturableBadge } from './facturable-badge'
import stylesAdmin from './aprobaciones-admin.module.css'
import { cn, esFacturable, esNoFacturable, fechaLocalISO, formatHora } from '@/lib/utils'

/** Registros por página dentro de cada sección. */
const POR_PAGINA = 10
type AccionInicial = 'responder' | 'corregir' | 'reenviar' | 'rechazar' | null
type ModoDecision = 'rechazar' | 'correccion' | null

type Feedback = { tipo: 'exito' | 'error'; texto: string } | null

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

export function ApprovalList({ periodo }: { periodo: PeriodoAprobaciones }) {
  const { historial } = useActividad()
  const { usuario } = useAuth()
  const { clientes } = useClientes()
  const esAdmin = usuario?.rol === 'admin'
  const esSupervisor = usuario?.rol === 'supervisor'
  const esPersonal = usuario?.rol === 'personal'
  // El SOCIO consulta pero no revisa: entra en la misma rama que el
  // administrador para ver todo el alcance de la empresa, pero NO cuenta como
  // revisor, así que los botones de aprobar, rechazar y solicitar corrección no
  // se le montan. El bloqueo real está en la API (lib/auth.ts).
  const esSocio = usuario?.rol === 'socio'
  const soloLectura = esSocio
  // El jefe de área revisa los registros de SU área: cuenta como revisor para que
  // aparezcan aprobar y rechazar. Lo que puede tocar lo decide la API, que
  // compara el área de la actividad con la suya; aquí solo se decide qué botones
  // se pintan.
  const esJefeArea = usuario?.rol === 'jefe_area'
  const esRevisor = esAdmin || esSupervisor || esJefeArea
  // El socio NO revisa, pero sí audita: ve el historial completo, incluidas las
  // notas internas, que al trabajador nunca se le enseñan.
  const veNotasInternas = esRevisor || esSocio
  const [filtro, setFiltro] = useState<FiltroAdmin>(esRevisor || esSocio ? 'pendientes' : 'todas')
  const [busquedaAdmin, setBusquedaAdmin] = useState('')
  const [divisionAdmin, setDivisionAdmin] = useState('')
  const [pagina, setPagina] = useState(1)
  const [detalle, setDetalle] = useState<Actividad | null>(null)
  const [detalleAccion, setDetalleAccion] = useState<AccionInicial>(null)
  const [observacionInicial, setObservacionInicial] = useState<number | null>(null)
  const [timeline, setTimeline] = useState<ObservacionTimeline[]>([])
  const [timelineCargando, setTimelineCargando] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set())
  const [confirmarMasivo, setConfirmarMasivo] = useState(false)
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
  const idDetalleAbierto = useRef<number | null>(null)

  const cargarAprobaciones = useCallback(async () => {
    if (!usuario) return
    setCargando(true)
    setErrorCarga(null)
    try {
      let url = '/api/aprobaciones'
      const params = new URLSearchParams()
      if (esPersonal) params.set('usuario_id', String(usuario.id))
      if (params.toString()) url += `?${params.toString()}`
      const res = await fetch(url, { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudieron cargar las aprobaciones.'))
      if (!Array.isArray(data)) throw new Error('La respuesta de aprobaciones no es válida.')
      setAprobaciones(data as Actividad[])
      setCargaAprobacionesOk(true)
      return data as Actividad[]
    } catch (e) {
      setErrorCarga(e instanceof Error ? e.message : 'No se pudieron cargar las aprobaciones.')
    } finally {
      setCargando(false)
    }
  }, [usuario, esPersonal])

  useEffect(() => {
    void cargarAprobaciones()
  }, [cargarAprobaciones])

  const cargarTimeline = useCallback(async (actividadId: number) => {
    if (!usuario) return
    const secuencia = ++secuenciaTimeline.current
    // El timeline se vacía al abrir, no al terminar de cargar. Sin esto, al
    // pasar de un registro con observaciones a otro se pintaba durante un
    // instante el historial del anterior y luego se sustituía por el correcto:
    // un parpadeo que parece un fallo y no lo es. Mientras llega la respuesta
    // se ve el esqueleto de carga, que es lo que toca.
    setTimeline([])
    setTimelineCargando(true)
    setTimelineError(null)
    try {
      const res = await fetch(`/api/actividades/${actividadId}/observaciones`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo cargar el historial de observaciones.'))
      if (secuencia !== secuenciaTimeline.current) return
      const datos = normalizarTimeline(data)
      setTimeline(datos.filter((item) => veNotasInternas || (esVisibleParaTrabajador(item) && item.tipo !== 'NOTA_INTERNA')))
    } catch (e) {
      if (secuencia !== secuenciaTimeline.current) return
      setTimeline([])
      setTimelineError(e instanceof Error ? e.message : 'No se pudo cargar el historial de observaciones.')
    } finally {
      if (secuencia === secuenciaTimeline.current) setTimelineCargando(false)
    }
  }, [usuario, veNotasInternas])

  const abrirDetalle = useCallback((
    actividad: Actividad,
    accion: AccionInicial = null,
    observacionId: number | null = null,
  ) => {
    idDetalleAbierto.current = actividad.id
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
      const res = await fetch(`/api/actividades/${actividadId}`, { credentials: 'same-origin' })
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

  const registros = useMemo(() => {
    if (cargaAprobacionesOk) return aprobaciones
    if (esRevisor || !usuario) return []
    return historial.filter((actividad) => actividad.usuario_id === usuario.id)
  }, [cargaAprobacionesOk, aprobaciones, historial, esRevisor, usuario])

  const normalizarBusqueda = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
  const divisionesAdmin = [...new Map(registros.flatMap((fila) => fila.area_id != null && fila.area_nombre
    ? [[fila.area_id, fila.area_nombre] as const] : []))].map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  const todas = registros.filter((fila) => {
    if (esPersonal && fila.usuario_id !== usuario?.id) return false
    if ((esAdmin || esSocio) && divisionAdmin && String(fila.area_id) !== divisionAdmin) return false
    const fecha = fechaDeRegistro(fila)
    return (!periodo.desde || fecha >= periodo.desde) && (!periodo.hasta || fecha <= periodo.hasta)
  })
  const reiniciarSeleccion = () => {
    setPagina(1)
    setSeleccionadas(new Set())
  }
  const { desde, hasta } = periodo
  useEffect(() => {
    setPagina(1)
    setSeleccionadas(new Set())
  }, [desde, hasta])

  const consulta = normalizarBusqueda(busquedaAdmin.trim())
  const filtradas = todas.filter((actividad) => {
    const coincideEstado = filtro === 'todas' || actividad.estado === {
      pendientes: 'PENDIENTE_APROBACION',
      correccion: 'CORRECCION_SOLICITADA',
      aprobadas: 'APROBADA',
      rechazadas: 'RECHAZADA',
    }[filtro]
    if (!coincideEstado || !consulta) return coincideEstado
    const texto = normalizarBusqueda([actividad.id, actividad.cliente_nombre, actividad.area_nombre,
      actividad.usuario_nombre, actividad.descripcion, actividad.tipo_actividad_nombre].join(' '))
    return texto.includes(consulta)
  })

  // Paginación por sección.
  //
  // Sin esto la pantalla pintaba las ~700 filas de la empresa de una vez: la
  // lista tardaba en aparecer y revisar era imposible porque no cabía nada en
  // pantalla. Cada filtro pagina por su cuenta, así que la página es siempre
  // relativa a la sección que se está mirando.
  //
  // `paginaActual` se acota con `Math.min` porque los datos se recargan solos
  // (el stream de eventos y el sondeo de seguridad vuelven a pedirlos): si la
  // sección se queda con menos filas, la página elegida podría ya no existir y
  // sin el acote se vería una lista vacía.
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicioPagina = (paginaActual - 1) * POR_PAGINA
  const filtradasPagina = filtradas.slice(inicioPagina, inicioPagina + POR_PAGINA)

  const pendientesIds = filtradas
    .filter((actividad) => actividad.estado === 'PENDIENTE_APROBACION').map((actividad) => actividad.id)
  const pendientesSeleccionadas = new Set(pendientesIds.filter((id) => seleccionadas.has(id)))

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

  const cerrarDetalle = () => {
    idDetalleAbierto.current = null
    setDetalle(null)
  }

  const completarRevision = async (actividad: Actividad, desdeDetalle: boolean, mensaje: string) => {
    const avanzar = desdeDetalle && esRevisor
    if (!avanzar && idDetalleAbierto.current === actividad.id) cerrarDetalle()
    const actualizadas = await cargarAprobaciones()
    if (avanzar && idDetalleAbierto.current === actividad.id) {
      const cola = filtradas.filter((fila) => fila.estado === 'PENDIENTE_APROBACION')
      const indice = cola.findIndex((fila) => fila.id === actividad.id)
      const orden = [...cola.slice(indice + 1), ...cola.slice(0, Math.max(0, indice))]
      const pendientesActualizadas = new Map(actualizadas?.filter((fila) => fila.estado === 'PENDIENTE_APROBACION').map((fila) => [fila.id, fila]))
      const siguiente = orden.map((fila) => pendientesActualizadas.get(fila.id)).find(Boolean)
      if (siguiente) abrirDetalle(siguiente)
      else cerrarDetalle()
      setFeedback({ tipo: 'exito', texto: siguiente ? mensaje + ' Siguiente pendiente abierto.' : mensaje })
    } else {
      setFeedback({ tipo: 'exito', texto: mensaje })
    }
  }

  const manejarAprobar = async (actividad: Actividad, desdeDetalle = false): Promise<boolean> => {
    if (!usuario || !esRevisor) return false
    setProcesando(`aprobar-${actividad.id}`)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          estado: 'APROBADA',
          revisado_por: usuario.id,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo aprobar la actividad.'))
      await completarRevision(actividad, desdeDetalle, 'Actividad aprobada.')
      return true
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo aprobar la actividad.' })
      return false
    } finally {
      setProcesando(null)
    }
  }

  const manejarRechazar = async (actividad: Actividad, motivo: string, desdeDetalle = false): Promise<boolean> => {
    if (!usuario || !esRevisor || !motivo.trim()) return false
    setProcesando(`rechazar-${actividad.id}`)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          estado: 'RECHAZADA',
          revisado_por: usuario.id,
          observacion_revision: motivo.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(errorDeRespuesta(data, 'No se pudo rechazar la actividad.'))
      await completarRevision(actividad, desdeDetalle, 'Actividad rechazada.')
      return true
    } catch (e) {
      setFeedback({ tipo: 'error', texto: e instanceof Error ? e.message : 'No se pudo rechazar la actividad.' })
      return false
    } finally {
      setProcesando(null)
    }
  }

  const solicitarCorreccion = async (actividad: Actividad, motivo: string): Promise<boolean> => {
    if (!usuario || !esRevisor || !motivo.trim()) return false
    setProcesando(`corregir-${actividad.id}`)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}/solicitar-correccion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
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
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
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
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
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
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
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
    if (!usuario || !esRevisor) return
    setProcesando('masivo')
    let errorMasivo: string | null = null
    for (const id of pendientesSeleccionadas) {
      const actividad = todas.find((item) => item.id === id)
      if (!actividad) continue
      try {
        const res = await fetch(`/api/actividades/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
          body: JSON.stringify({ estado: 'APROBADA', revisado_por: usuario.id }),
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

        {errorCarga && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/25 bg-card px-4 py-3 text-sm text-rose-400">
            <span>{errorCarga}</span>
            <button type="button" onClick={() => void cargarAprobaciones()} className="font-medium underline">Reintentar</button>
          </div>
        )}
        {!cargaAprobacionesOk && !errorCarga && (
          <p role="status" className="rounded-xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground">Cargando aprobaciones…</p>
        )}
        {cargaAprobacionesOk && <AprobacionesAdminVista
          registros={todas}
          filas={filtradasPagina}
          areas={divisionesAdmin}
          area={divisionAdmin}
          busqueda={busquedaAdmin}
          filtro={filtro}
          puedeRevisar={esRevisor}
          filtrarDivision={esAdmin || esSocio}
          periodo={periodo}
          pendientesSeleccionables={pendientesIds.length}
          seleccionadas={pendientesSeleccionadas}
          todasSeleccionadas={todasSeleccionadas}
          pagina={paginaActual}
          paginas={totalPaginas}
          procesando={procesando}
          cargando={cargando}
          onArea={(area) => { setDivisionAdmin(area); reiniciarSeleccion() }}
          onBusqueda={(busqueda) => { setBusquedaAdmin(busqueda); reiniciarSeleccion() }}
          onFiltro={(estado) => { setFiltro(estado); reiniciarSeleccion() }}
          onSeleccionarTodas={alternarSeleccionarTodas}
          onSeleccionar={alternarSeleccion}
          onPagina={setPagina}
          onAprobar={(fila) => void manejarAprobar(fila)}
          onRechazar={(fila) => abrirDetalle(fila, 'rechazar')}
          onDetalle={abrirDetalle}
          onAprobarSeleccionadas={() => setConfirmarMasivo(true)}
          duracion={formatDuracion}
        />}
      {detalle && (
        <DetalleActividadModal
          actividad={detalle}
          ampliado
            esRevisor={esRevisor}
            veNotasInternas={veNotasInternas}
            soloLectura={soloLectura}
          timeline={timeline}
          timelineCargando={timelineCargando}
          timelineError={timelineError}
          accionInicial={detalleAccion}
          observacionInicial={observacionInicial}
          clientes={clientes}
          procesando={procesando}
          feedback={feedback}
          onCerrar={cerrarDetalle}
          onAprobar={() => manejarAprobar(detalle, true)}
          onRechazar={(motivo) => manejarRechazar(detalle, motivo, true)}
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
            <p className="mt-1.5 text-sm text-muted-foreground">¿Deseas aprobar {pendientesSeleccionadas.size} {pendientesSeleccionadas.size === 1 ? 'actividad pendiente' : 'actividades pendientes'}?</p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setConfirmarMasivo(false)} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:border-[#7c3aed]/50">Cancelar</button>
              <button onClick={() => void aprobarSeleccionadas()} disabled={procesando === 'masivo' || !pendientesSeleccionadas.size} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={16} />Sí, aprobar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DetalleActividadModal({
  actividad,
  ampliado,
  esRevisor,
  veNotasInternas,
  soloLectura,
  timeline,
  timelineCargando,
  timelineError,
  accionInicial,
  observacionInicial,
  clientes,
  procesando,
  feedback,
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
  ampliado: boolean
  esRevisor: boolean
  /** Quién ve el historial completo, incluidas las notas internas. */
  veNotasInternas: boolean
  /** Perfil SOCIO: consulta sin poder responder ni cambiar nada. */
  soloLectura: boolean
  timeline: ObservacionTimeline[]
  timelineCargando: boolean
  timelineError: string | null
  accionInicial: AccionInicial
  observacionInicial: number | null
  clientes: Array<{ id: number; nombre: string; area_id: number; activo: boolean }>
  procesando: string | null
  feedback: Feedback
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
  const marcoDetalle = useRef<HTMLDivElement>(null)
  const panelDetalle = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ id: number; x: number; y: number } | null>(null)
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 })
  const tituloDetalle = useId()

  const moverDetalle = (dx: number, dy: number) => {
    const panel = panelDetalle.current
    const marco = marcoDetalle.current
    if (!panel?.offsetWidth || !marco) return
    const caja = panel.getBoundingClientRect()
    const limite = marco.getBoundingClientRect()
    const escala = caja.width / panel.offsetWidth
    setDesplazamiento({
      x: desplazamiento.x + Math.min(limite.right - caja.right, Math.max(limite.left - caja.left, dx)) / escala,
      y: desplazamiento.y + Math.min(limite.bottom - caja.bottom, Math.max(limite.top - caja.top, dy)) / escala,
    })
  }

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

  const visibles = timeline.filter((item) => veNotasInternas || (esVisibleParaTrabajador(item) && item.tipo !== 'NOTA_INTERNA'))
  const puedeCorregir = !esRevisor && !soloLectura && actividad.estado === 'CORRECCION_SOLICITADA'
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
    <div ref={marcoDetalle} className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-3" onClick={onCerrar} onKeyDown={(evento) => { if (evento.key === 'Escape') onCerrar() }}>
      <div ref={panelDetalle} role="dialog" aria-modal="true" aria-labelledby={tituloDetalle}
        className={cn('flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden border border-border bg-card shadow-2xl sm:h-[min(82vh,720px)] sm:rounded-2xl', ampliado && stylesAdmin.detalleGrande)}
        style={ampliado ? { '--detalle-x': desplazamiento.x + 'px', '--detalle-y': desplazamiento.y + 'px' } as React.CSSProperties : undefined}
        onClick={(event) => event.stopPropagation()}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          {ampliado && <button type="button" className={stylesAdmin.moverDetalle} aria-label="Mover ventana con las flechas" title="Arrastra para mover la ventana"
            onPointerDown={(evento) => {
              if (evento.button !== 0) return
              arrastre.current = { id: evento.pointerId, x: evento.clientX, y: evento.clientY }
              evento.currentTarget.setPointerCapture(evento.pointerId)
            }}
            onPointerMove={(evento) => {
              const anterior = arrastre.current
              if (!anterior || anterior.id !== evento.pointerId) return
              moverDetalle(evento.clientX - anterior.x, evento.clientY - anterior.y)
              arrastre.current = { id: anterior.id, x: evento.clientX, y: evento.clientY }
            }}
            onLostPointerCapture={() => { arrastre.current = null }}
            onKeyDown={(evento) => {
              const movimientos: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }
              const movimiento = movimientos[evento.key]
              if (!movimiento) return
              evento.preventDefault()
              moverDetalle(...movimiento)
            }}><GripHorizontal size={20} /></button>}
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed]/15 text-[#c4b5fd]"><FileText size={16} /></div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={tituloDetalle} className={cn("truncate text-sm font-semibold text-foreground", ampliado && stylesAdmin.tituloDetalle)}>{actividad.descripcion || 'Actividad sin descripción'}</h2>
                <StatusBadge estado={actividad.estado} />
              </div>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{actividad.usuario_nombre ?? 'Colaborador'} · {fechaLocalISO(actividad.inicio)} · #{actividad.id}</p>
            </div>
          </div>
          <button type="button" onClick={onCerrar} className="ml-auto rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Cerrar detalle"><X size={17} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="px-3 py-3 sm:px-4">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <DatoGrupo etiqueta="Tipo" valor={actividad.tipo_actividad_nombre || '—'} />
              <DatoGrupo etiqueta="Cliente" valor={actividad.cliente_nombre || 'Sin cliente'} />
              <DatoGrupo etiqueta="Horario / Duración" valor={`${formatHora(actividad.inicio)} – ${actividad.fin ? formatHora(actividad.fin) : '—'} · ${formatDuracion(actividad)}`} />
            </div>

            {/* El historial solo se pinta cuando ya tiene datos, nunca mientras
                carga ni cuando sale vacío. Un esqueleto de carga que un instante
                después se sustituye por el contenido real se lee como un fallo:
                el cuadro aparece, cambia de tamaño y vuelve a aparecer. Y un
                registro recién llegado y sin una sola observación no gana nada
                con un cuadro que dice "No hay observaciones registradas".
                Si la carga falla sí se avisa: eso es información, no un parpadeo. */}
            {!timelineCargando && (timelineError || visibles.length > 0) && (
              <div className="mb-3 rounded-lg border border-border bg-muted/20 p-2.5">
                <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-medium text-foreground">Historial de observaciones</p><p className="text-[11px] text-muted-foreground">{visibles.length} evento(s) visible(s)</p></div>
                {esRevisor && timeline.some((item) => item.visibilidad === 'INTERNA') && <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300"><LockKeyhole size={10} />Incluye notas internas</span>}
              </div>
              {timelineError ? (
                <p className="mt-2.5 text-[11px] text-rose-400">{timelineError}</p>
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
                        {!esRevisor && !soloLectura && (item.tipo === 'OBSERVACION' || item.tipo === 'SOLICITUD_CORRECCION') && item.estado_atencion === 'ABIERTA' && <button type="button" onClick={() => setParentId(item.id)} className="mt-1.5 text-[10px] font-medium text-[#c4b5fd] hover:text-[#a78bfa]">Responder esta observación</button>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              </div>
            )}

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
            ) : soloLectura ? (
              // El socio lee el historial completo, incluidas las notas internas,
              // pero no escribe en él. Sin este bloque caería en la rama del
              // trabajador y aparecería el formulario de respuesta.
              <div className="flex items-start gap-2 rounded-lg border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-3">
                <LockKeyhole size={14} className="mt-0.5 shrink-0 text-[#c4b5fd]" />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Estás viendo el historial completo de la actividad, incluidas las notas internas.
                  Tu perfil es de solo lectura: no puedes responder, aprobar ni rechazar.
                </p>
              </div>
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
                modoDecision={modoDecision}
                motivo={motivo}
                procesando={procesando}
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
  modoDecision,
  motivo,
  procesando,
  onModo,
  onMotivo,
  onConfirmar,
}: {
  actividad: Actividad
  modoDecision: ModoDecision
  motivo: string
  procesando: string | null
  onModo: (modo: ModoDecision) => void
  onMotivo: (valor: string) => void
  onConfirmar: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#c4b5fd]" /><h3 className="text-xs font-semibold text-foreground">Revisión</h3></div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">Revisa la información y decide cómo continuar con esta actividad.</p>
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
