'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Inbox,
  MessageSquare,
  Pencil,
  Send,
  UserRound,
  X,
} from 'lucide-react'
import type { AccionMisObservacion, MisObservacion } from '@/lib/observaciones-ui'
import { esVisibleParaTrabajador, normalizarEstadoAtencion } from '@/lib/observaciones-ui'
import { cn, fechaLocalISO } from '@/lib/utils'

const filtros = {
  pendientes: 'Pendientes',
  atendidas: 'Atendidas',
  todas: 'Todas',
} as const

type Filtro = keyof typeof filtros

function token(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
}

function normalizarAcciones(valor: unknown, observacion: MisObservacion): AccionMisObservacion[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const fila = item as Record<string, unknown>
      const codigo = String(fila.codigo ?? '')
      if (!['RESPONDER', 'CORREGIR', 'REENVIO', 'ATENDER', 'VER'].includes(codigo)) return []
      return [{
        codigo: codigo as AccionMisObservacion['codigo'],
        etiqueta: String(fila.etiqueta ?? 'Abrir'),
        url: String(fila.url ?? '/actividades'),
      }]
    })
  }
  if (observacion.modulo === 'APROBACIONES' && observacion.actividad) {
    return [{ codigo: 'VER', etiqueta: 'Ver detalle', url: `/aprobaciones?actividad=${observacion.actividad.id}&observacion=${observacion.id}` }]
  }
  return []
}

function normalizarObservacion(valor: unknown): MisObservacion | null {
  if (!valor || typeof valor !== 'object') return null
  const fila = valor as Record<string, unknown>
  if (String(fila.tipo ?? '').toUpperCase() === 'NOTA_INTERNA') return null
  if (fila.visibilidad != null && !esVisibleParaTrabajador({ visibilidad: String(fila.visibilidad), tipo: String(fila.tipo ?? '') })) return null
  const id = Number(fila.id)
  if (!Number.isInteger(id) || id <= 0) return null
  const periodoFila = fila.periodo && typeof fila.periodo === 'object' ? fila.periodo as Record<string, unknown> : {}
  const actividadFila = fila.actividad && typeof fila.actividad === 'object' ? fila.actividad as Record<string, unknown> : null
  const autorFila = fila.autor && typeof fila.autor === 'object' ? fila.autor as Record<string, unknown> : null
  const tipo = String(fila.tipo ?? 'OBSERVACION') as MisObservacion['tipo']
  const observacion: MisObservacion = {
    id,
    modulo: String(fila.modulo ?? 'APROBACIONES') === 'CUMPLIMIENTO' ? 'CUMPLIMIENTO' : 'APROBACIONES',
    tipo,
    contenido: String(fila.contenido ?? ''),
    estado_atencion: normalizarEstadoAtencion(fila.estado_atencion),
    parent_id: fila.parent_id == null ? null : Number(fila.parent_id),
    periodo: {
      anio: periodoFila.anio == null ? null : Number(periodoFila.anio),
      mes: periodoFila.mes == null ? null : Number(periodoFila.mes),
    },
    actividad: actividadFila && actividadFila.id != null ? {
      id: Number(actividadFila.id),
      descripcion: actividadFila.descripcion == null ? null : String(actividadFila.descripcion),
      estado: String(actividadFila.estado ?? ''),
      inicio: actividadFila.inicio == null ? null : String(actividadFila.inicio),
      tipo_actividad: actividadFila.tipo_actividad == null ? null : String(actividadFila.tipo_actividad),
      cliente: actividadFila.cliente == null ? null : String(actividadFila.cliente),
    } : null,
    autor: autorFila && autorFila.id != null ? { id: Number(autorFila.id), nombre: String(autorFila.nombre ?? '') } : null,
    created_at: String(fila.created_at ?? ''),
    acciones: [],
  }
  observacion.acciones = normalizarAcciones(fila.acciones, observacion)
  return observacion
}

function normalizarLista(valor: unknown): MisObservacion[] {
  const lista = Array.isArray(valor)
    ? valor
    : valor && typeof valor === 'object' && Array.isArray((valor as Record<string, unknown>).observaciones)
      ? (valor as Record<string, unknown>).observaciones
      : []
  return (lista as unknown[]).map(normalizarObservacion).filter((item): item is MisObservacion => item != null)
}

function fechaLegible(valor: string | null): string {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return fecha.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function periodoLegible(observacion: MisObservacion): string {
  if (observacion.actividad?.inicio) return fechaLocalISO(observacion.actividad.inicio)
  if (observacion.periodo.anio != null && observacion.periodo.mes != null) {
    return `${String(observacion.periodo.mes).padStart(2, '0')}/${observacion.periodo.anio}`
  }
  return '—'
}

function tipoLegible(tipo: MisObservacion['tipo']): string {
  const etiquetas: Record<string, string> = {
    OBSERVACION: 'Observación',
    NOTA_INTERNA: 'Nota interna',
    SOLICITUD_CORRECCION: 'Solicitud de corrección',
    RESPUESTA: 'Respuesta',
    REENVIO: 'Reenvío',
    APROBACION: 'Aprobación',
    RECHAZO: 'Rechazo',
  }
  return etiquetas[tipo] ?? 'Observación'
}

function claseEstado(estado: MisObservacion['estado_atencion']): string {
  if (estado === 'ABIERTA') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (estado === 'ATENDIDA') return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
}

function urlAprobacion(accion: AccionMisObservacion, observacion: MisObservacion): string {
  if (!observacion.actividad) return `/actividades?observacion=${observacion.id}`
  const query = new URLSearchParams({
    actividad: String(observacion.actividad.id),
    observacion: String(observacion.id),
  })
  if (accion.codigo === 'RESPONDER') query.set('accion', 'responder')
  if (accion.codigo === 'CORREGIR') query.set('accion', 'corregir')
  if (accion.codigo === 'REENVIO') query.set('accion', 'reenviar')
  return `/aprobaciones?${query.toString()}`
}

export function MisObservaciones() {
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [modulo, setModulo] = useState<'TODOS' | 'APROBACIONES' | 'CUMPLIMIENTO'>('TODOS')
  const [observaciones, setObservaciones] = useState<MisObservacion[]>([])
  const [seleccionada, setSeleccionada] = useState<MisObservacion | null>(null)
  const [respuestaId, setRespuestaId] = useState<number | null>(null)
  const [respuesta, setRespuesta] = useState('')
  const [accionCargando, setAccionCargando] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    const cargar = async () => {
      setCargando(true)
      setError(null)
      try {
        const valor = token()
        const res = await fetch('/api/observaciones/mis', { headers: valor ? { Authorization: `Bearer ${valor}` } : undefined })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'No se pudieron cargar tus observaciones.')
        if (vigente) {
          const lista = normalizarLista(data)
          setObservaciones(lista)
          const observacionQuery = new URLSearchParams(window.location.search).get('observacion')
          const idQuery = observacionQuery ? Number(observacionQuery) : null
          if (idQuery != null && Number.isInteger(idQuery)) {
            setSeleccionada(lista.find((item) => item.id === idQuery) ?? null)
          }
        }
      } catch (e) {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudieron cargar tus observaciones.')
      } finally {
        if (vigente) setCargando(false)
      }
    }
    void cargar()
    return () => { vigente = false }
  }, [])

  const marcarCumplimientoAtendida = async (observacion: MisObservacion) => {
    if (accionCargando != null) return
    setAccionCargando(observacion.id)
    setFeedback(null)
    try {
      const valor = token()
      const res = await fetch('/api/cumplimiento/observaciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(valor ? { Authorization: `Bearer ${valor}` } : {}),
        },
        body: JSON.stringify({ accion: 'ATENDER', observacion_id: observacion.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo marcar la observación como atendida.')
      setObservaciones((prev) => prev.map((item) => item.id === observacion.id
        ? { ...item, estado_atencion: 'ATENDIDA' }
        : item))
      setFeedback('Observación marcada como atendida.')
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'No se pudo marcar la observación como atendida.')
    } finally {
      setAccionCargando(null)
    }
  }

  const enviarRespuestaCumplimiento = async (observacion: MisObservacion) => {
    if (!respuesta.trim() || accionCargando != null) return
    setAccionCargando(observacion.id)
    setFeedback(null)
    try {
      const valor = token()
      const res = await fetch('/api/cumplimiento/observaciones', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(valor ? { Authorization: `Bearer ${valor}` } : {}),
        },
        body: JSON.stringify({
          accion: 'RESPONDER',
          parent_id: observacion.id,
          observacion_id: observacion.id,
          contenido: respuesta.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la respuesta.')
      setObservaciones((prev) => prev.map((item) => item.id === observacion.id
        ? { ...item, estado_atencion: 'ATENDIDA' }
        : item))
      setRespuesta('')
      setRespuestaId(null)
      setFeedback('Respuesta enviada. La observación quedó atendida.')
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'No se pudo enviar la respuesta.')
    } finally {
      setAccionCargando(null)
    }
  }

  const filtradas = useMemo(() => observaciones.filter((observacion) => {
    if (filtro === 'pendientes' && observacion.estado_atencion !== 'ABIERTA') return false
    if (filtro === 'atendidas' && observacion.estado_atencion === 'ABIERTA') return false
    if (modulo !== 'TODOS' && observacion.modulo !== modulo) return false
    return true
  }), [filtro, modulo, observaciones])

  const pendientes = observaciones.filter((observacion) => observacion.estado_atencion === 'ABIERTA').length

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Tus observaciones</p>
          <p className="text-xs text-muted-foreground">{pendientes} pendiente(s) · {observaciones.length} total(es)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border bg-background p-0.5">
            {(Object.keys(filtros) as Filtro[]).map((clave) => <button type="button" key={clave} onClick={() => setFiltro(clave)} className={cn('rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors', filtro === clave ? 'bg-[#7c3aed] text-white' : 'text-muted-foreground hover:text-foreground')}>{filtros[clave]}</button>)}
          </div>
          <select value={modulo} onChange={(event) => setModulo(event.target.value as typeof modulo)} className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40">
            <option value="TODOS">Todos los módulos</option>
            <option value="APROBACIONES">Aprobaciones</option>
            <option value="CUMPLIMIENTO">Cumplimiento</option>
          </select>
        </div>
      </div>

      {seleccionada && (
        <section className="rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2"><MessageSquare size={16} className="mt-0.5 shrink-0 text-[#c4b5fd]" /><div className="min-w-0"><h3 className="text-sm font-semibold text-foreground">Detalle de {tipoLegible(seleccionada.tipo)}</h3><p className="mt-0.5 text-xs text-muted-foreground">{periodoLegible(seleccionada)} · {seleccionada.autor?.nombre || 'Administración'}</p></div></div>
            <button type="button" onClick={() => setSeleccionada(null)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar detalle"><X size={16} /></button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{seleccionada.contenido}</p>
          {seleccionada.actividad && <p className="mt-2 text-xs text-muted-foreground">Actividad: {seleccionada.actividad.descripcion || 'Sin descripción'} · {seleccionada.actividad.cliente || 'Sin cliente'}</p>}
        </section>
      )}

      {feedback && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{feedback}</div>}
      {error && <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">{error}</div>}

      {cargando ? (
        <div className="space-y-2.5"><div className="h-24 animate-pulse rounded-xl bg-muted/60" /><div className="h-24 animate-pulse rounded-xl bg-muted/60" /></div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-10 text-center"><Inbox size={28} className="mx-auto mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">No hay observaciones para este filtro.</p></div>
      ) : (
        <div className="space-y-2.5">
          {filtradas.map((observacion) => {
            const esCumplimiento = observacion.modulo === 'CUMPLIMIENTO'
            return (
              <article key={observacion.id} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-[#7c3aed]/35">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed]/10 text-[#c4b5fd]">{esCumplimiento ? <CalendarDays size={15} /> : <FileText size={15} />}</div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-foreground">{tipoLegible(observacion.tipo)}</span><span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', claseEstado(observacion.estado_atencion))}>{observacion.estado_atencion === 'ABIERTA' ? 'Pendiente' : observacion.estado_atencion === 'ATENDIDA' ? 'Atendida' : 'Resuelta'}</span></div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{esCumplimiento ? 'Cumplimiento' : 'Aprobaciones'} · {fechaLegible(observacion.created_at)}</p>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">#{observacion.id}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{observacion.contenido}</p>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <span className="inline-flex items-center gap-1.5"><UserRound size={12} />{observacion.autor?.nombre || 'Administración'}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={12} />{periodoLegible(observacion)}</span>
                  <span className="truncate">{observacion.actividad?.descripcion || (observacion.periodo.anio ? `Período ${observacion.periodo.mes}/${observacion.periodo.anio}` : 'Sin actividad')}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <span className="text-[11px] text-muted-foreground">Visible para ti</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {esCumplimiento ? (
                      <>
                        <button type="button" onClick={() => setSeleccionada(observacion)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-[#7c3aed]/50 hover:text-[#c4b5fd]"><Eye size={13} />Ver detalle</button>
                        {observacion.estado_atencion === 'ABIERTA' && observacion.acciones.some((accion) => accion.codigo === 'RESPONDER') && (
                          <button type="button" onClick={() => { setSeleccionada(observacion); setRespuestaId(observacion.id); setRespuesta('') }} className="inline-flex items-center gap-1.5 rounded-lg border border-[#7c3aed]/40 px-2.5 py-1.5 text-xs font-medium text-[#c4b5fd] hover:bg-[#7c3aed]/10"><MessageSquare size={13} />Responder</button>
                        )}
                        {observacion.estado_atencion === 'ABIERTA' && observacion.acciones.some((accion) => accion.codigo === 'ATENDER') && (
                          <button type="button" onClick={() => void marcarCumplimientoAtendida(observacion)} disabled={accionCargando === observacion.id} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 px-2.5 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/10 disabled:opacity-50"><CheckCircle2 size={13} />Marcar atendida</button>
                        )}
                      </>
                    ) : (
                      <>
                        {observacion.acciones.filter((accion) => accion.codigo !== 'VER').map((accion) => <Link key={accion.codigo} href={urlAprobacion(accion, observacion)} className={cn('inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors', accion.codigo === 'RESPONDER' ? 'border border-[#7c3aed]/40 text-[#c4b5fd] hover:bg-[#7c3aed]/10' : 'border border-sky-500/40 text-sky-300 hover:bg-sky-500/10')}>
                          {accion.codigo === 'RESPONDER' ? <Send size={12} /> : <Pencil size={12} />}{accion.etiqueta}
                        </Link>)}
                        <Link href={urlAprobacion(observacion.acciones.find((accion) => accion.codigo === 'VER') || { codigo: 'VER', etiqueta: 'Ver', url: '' }, observacion)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-[#7c3aed]/50 hover:text-[#c4b5fd]"><Eye size={13} />Ver</Link>
                      </>
                    )}
                  </div>
                </div>
                {esCumplimiento && respuestaId === observacion.id && observacion.estado_atencion === 'ABIERTA' && (
                  <form onSubmit={(event) => { event.preventDefault(); void enviarRespuestaCumplimiento(observacion) }} className="mt-3 rounded-lg border border-[#7c3aed]/30 bg-[#7c3aed]/5 p-3">
                    <label htmlFor={`respuesta-cumplimiento-${observacion.id}`} className="mb-1.5 block text-xs font-medium text-foreground">Tu respuesta</label>
                    <textarea id={`respuesta-cumplimiento-${observacion.id}`} value={respuesta} onChange={(event) => setRespuesta(event.target.value)} rows={3} maxLength={2000} placeholder="Escribe tu respuesta..." className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:border-[#7c3aed]/50 focus:outline-none" />
                    <button type="submit" disabled={!respuesta.trim() || accionCargando === observacion.id} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6d28d9] disabled:opacity-50"><Send size={12} />{accionCargando === observacion.id ? 'Enviando...' : 'Enviar respuesta'}</button>
                  </form>
                )}
              </article>
            )
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><CheckCircle2 size={12} className="text-emerald-400" />Las notas internas no se muestran en esta sección.</p>
    </div>
  )
}
