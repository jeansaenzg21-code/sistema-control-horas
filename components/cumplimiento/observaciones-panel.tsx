'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Eye,
  FileText,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Send,
  UserRound,
  X,
} from 'lucide-react'
import type { ColaboradorCumplimiento } from '@/lib/cumplimiento'
import type { CumplimientoObservacion, TipoObservacion, VisibilidadObservacion } from '@/lib/observaciones-ui'
import { normalizarEstadoAtencion, normalizarVisibilidad } from '@/lib/observaciones-ui'
import { cn, formatoHoras } from '@/lib/utils'

export interface MetricasObservacionesCumplimiento {
  registros: number
  horas_totales: number
  cobertura: number
  semanas_reportadas: number
  semanas_exigidas: number
}

interface Props {
  abierto: boolean
  colaborador: ColaboradorCumplimiento | null
  periodo: { anio: number; mes: number }
  metricas: MetricasObservacionesCumplimiento
  observacionesIniciales?: CumplimientoObservacion[]
  onCerrar: () => void
  onObservacionCreada?: (observacion: CumplimientoObservacion) => void
}

const etiquetasTipo: Record<string, string> = {
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

function token(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
}

function headers(): HeadersInit {
  const valor = token()
  return {
    'Content-Type': 'application/json',
    ...(valor ? { Authorization: `Bearer ${valor}` } : {}),
  }
}

function filaCumplimiento(valor: unknown): CumplimientoObservacion | null {
  if (!valor || typeof valor !== 'object') return null
  const fila = valor as Record<string, unknown>
  const id = Number(fila.id ?? fila.observacion_id)
  const usuarioId = Number(fila.usuario_id ?? fila.usuario_destino_id)
  const contenido = String(fila.contenido ?? fila.texto ?? '').trim()
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(usuarioId) || usuarioId <= 0 || !contenido) return null
  const creado = fila.created_at ?? fila.updated_at
  return {
    id,
    usuario_id: usuarioId,
    contenido,
    visibilidad: normalizarVisibilidad(fila.visibilidad),
    tipo: String(fila.tipo ?? 'OBSERVACION') as TipoObservacion,
    estado_atencion: normalizarEstadoAtencion(fila.estado_atencion),
    parent_id: fila.parent_id == null ? null : Number(fila.parent_id),
    autor_nombre: fila.autor_nombre == null ? null : String(fila.autor_nombre),
    usuario_nombre: fila.usuario_nombre == null ? null : String(fila.usuario_nombre),
    created_at: creado == null ? new Date().toISOString() : String(creado),
  }
}

function filasCumplimiento(valor: unknown): CumplimientoObservacion[] {
  const lista = Array.isArray(valor)
    ? valor
    : valor && typeof valor === 'object' && Array.isArray((valor as Record<string, unknown>).observaciones)
      ? (valor as Record<string, unknown>).observaciones
      : []
  return (lista as unknown[]).map(filaCumplimiento).filter((item): item is CumplimientoObservacion => item != null)
}

function combinarObservaciones(
  iniciales: CumplimientoObservacion[],
  recibidas: CumplimientoObservacion[],
): CumplimientoObservacion[] {
  const mapa = new Map<number, CumplimientoObservacion>()
  for (const item of [...iniciales, ...recibidas]) mapa.set(item.id, item)
  return [...mapa.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function fechaObservacion(valor: string): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return fecha.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function fechaHoraObservacion(valor: string): string {
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return valor
  return `${fechaObservacion(valor)} · ${fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
}

export function ObservacionesCumplimientoPanel({
  abierto,
  colaborador,
  periodo,
  metricas,
  observacionesIniciales = [],
  onCerrar,
  onObservacionCreada,
}: Props) {
  const [observaciones, setObservaciones] = useState<CumplimientoObservacion[]>([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contenido, setContenido] = useState('')
  const [visibilidad, setVisibilidad] = useState<VisibilidadObservacion>('TRABAJADOR')
  const [feedback, setFeedback] = useState<string | null>(null)
  const secuenciaCarga = useRef(0)

  const propias = useMemo(
    () => observaciones.filter((item) => !colaborador || item.usuario_id === colaborador.id),
    [observaciones, colaborador],
  )

  const cargar = useCallback(async () => {
    if (!abierto || !colaborador) return
    const secuencia = ++secuenciaCarga.current
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/cumplimiento/observaciones?anio=${periodo.anio}&mes=${periodo.mes}&usuario_id=${colaborador.id}`,
        { headers: headers() },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'No se pudieron cargar las observaciones.')
      }
      const data = await res.json()
      if (secuencia !== secuenciaCarga.current) return
      const recibidas = filasCumplimiento(data).filter((item) => item.usuario_id === colaborador.id)
      setObservaciones((prev) => combinarObservaciones([...observacionesIniciales, ...prev], recibidas))
    } catch (e) {
      if (secuencia === secuenciaCarga.current) setError(e instanceof Error ? e.message : 'No se pudieron cargar las observaciones.')
    } finally {
      if (secuencia === secuenciaCarga.current) setCargando(false)
    }
  }, [abierto, colaborador, periodo.anio, periodo.mes, observacionesIniciales])

  useEffect(() => {
    secuenciaCarga.current += 1
    if (!abierto || !colaborador) {
      setObservaciones([])
      setContenido('')
      setFeedback(null)
      return
    }
    setObservaciones(observacionesIniciales.filter((item) => item.usuario_id === colaborador.id))
    void cargar()
  }, [abierto, colaborador, observacionesIniciales, cargar])

  useEffect(() => {
    if (!abierto) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [abierto, onCerrar])

  const guardar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!colaborador || !contenido.trim() || guardando) return
    setGuardando(true)
    setError(null)
    setFeedback(null)
    try {
      const res = await fetch('/api/cumplimiento/observaciones', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          usuario_id: colaborador.id,
          anio: periodo.anio,
          mes: periodo.mes,
          contenido: contenido.trim(),
          visibilidad,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar la observación.')
      const nueva = filaCumplimiento(data.observacion ?? data) ?? {
        id: Date.now(),
        usuario_id: colaborador.id,
        contenido: contenido.trim(),
        visibilidad,
        estado_atencion: 'ABIERTA' as const,
        autor_nombre: 'Administración',
        created_at: new Date().toISOString(),
      }
      setObservaciones((prev) => combinarObservaciones(prev, [nueva]))
      onObservacionCreada?.(nueva)
      setContenido('')
      setVisibilidad('TRABAJADOR')
      setFeedback(visibilidad === 'INTERNA' ? 'Nota interna guardada.' : 'Observación visible guardada.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la observación.')
    } finally {
      setGuardando(false)
    }
  }

  if (!abierto || !colaborador) return null

  const abierta = propias.filter((item) => item.estado_atencion === 'ABIERTA').length
  const internas = propias.filter((item) => item.visibilidad === 'INTERNA').length

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 sm:bg-transparent" onClick={onCerrar}>
      <aside
        className="flex max-h-full w-full flex-col overflow-hidden border-l border-border bg-card shadow-2xl sm:w-[min(100%,31rem)]"
        onClick={(event) => event.stopPropagation()}
        aria-label={`Observaciones de ${colaborador.nombre}`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <MessageSquare size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">Observaciones</h2>
              <p className="truncate text-[11px] text-muted-foreground">{colaborador.nombre} · {periodo.anio}/{String(periodo.mes).padStart(2, '0')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Cerrar observaciones"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid shrink-0 grid-cols-3 divide-x divide-border border-b border-border bg-muted/20">
          <MetricaPanel etiqueta="Cobertura" valor={`${metricas.cobertura}%`} />
          <MetricaPanel etiqueta="Horas" valor={formatoHoras(metricas.horas_totales)} />
          <MetricaPanel etiqueta="Registros" valor={String(metricas.registros)} />
        </div>

        <div className="min-h-0 max-h-[min(28rem,60vh)] shrink-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-foreground">Historial del período</h3>
              <p className="text-[10px] text-muted-foreground">{abierta} pendiente(s) · {internas} interna(s)</p>
            </div>
            <button
              type="button"
              onClick={() => void cargar()}
              disabled={cargando}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#c4b5fd] disabled:opacity-50"
            >
              <RefreshCw size={12} className={cargando ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>

          {error && (
            <div className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[10px] text-rose-300">
              {error}
            </div>
          )}

          {cargando && propias.length === 0 ? (
            <div className="space-y-2">
              {[1, 2].map((item) => <div key={item} className="h-14 animate-pulse rounded-lg bg-muted/60" />)}
            </div>
          ) : propias.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              Todavía no hay observaciones para este colaborador.
            </div>
          ) : (
            <ol className="relative ml-1 space-y-0 border-l border-border pl-4">
              {propias.map((observacion) => (
                <li key={observacion.id} className="relative pb-3 last:pb-0">
                  <span
                    className={cn(
                      'absolute -left-[1.45rem] top-1 flex h-4 w-4 items-center justify-center rounded-full border bg-card',
                      observacion.visibilidad === 'INTERNA' ? 'border-amber-500/40 text-amber-400' : 'border-[#7c3aed]/40 text-[#c4b5fd]',
                    )}
                  >
                    {observacion.visibilidad === 'INTERNA' ? <LockKeyhole size={10} /> : <FileText size={10} />}
                  </span>
                  <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-foreground">
                          {etiquetasTipo[observacion.tipo ?? 'OBSERVACION'] ?? 'Observación'}
                        </span>
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                          observacion.visibilidad === 'INTERNA'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                            : 'border-sky-500/30 bg-sky-500/10 text-sky-300',
                        )}>
                          {observacion.visibilidad === 'INTERNA' ? <LockKeyhole size={9} /> : <Eye size={9} />}
                          {observacion.visibilidad === 'INTERNA' ? 'Interna' : 'Visible'}
                        </span>
                      </div>
                      <span className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                        observacion.estado_atencion === 'ABIERTA'
                          ? 'bg-amber-500/10 text-amber-300'
                          : observacion.estado_atencion === 'ATENDIDA'
                            ? 'bg-sky-500/10 text-sky-300'
                            : 'bg-emerald-500/10 text-emerald-300',
                      )}>
                        {etiquetasEstado[observacion.estado_atencion]}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-4 text-foreground">{observacion.contenido}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[9px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><UserRound size={10} />{observacion.autor_nombre || 'Administración'}</span>
                      <span className="inline-flex items-center gap-1"><CalendarDays size={10} />{fechaHoraObservacion(observacion.created_at)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <form onSubmit={guardar} className="shrink-0 border-t border-border bg-background/70 px-3 py-2.5 sm:px-4">
          {feedback && <p className="mb-1.5 text-[11px] font-medium text-emerald-400">{feedback}</p>}
          <label htmlFor="nueva-observacion-cumplimiento" className="mb-1 block text-[11px] font-semibold text-foreground">
            Nueva observación
          </label>
          <textarea
            id="nueva-observacion-cumplimiento"
            value={contenido}
            onChange={(event) => setContenido(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Escribe una observación para este período..."
            className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#7c3aed]/50 focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/20"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex rounded-md border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setVisibilidad('TRABAJADOR')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                  visibilidad === 'TRABAJADOR' ? 'bg-sky-500/15 text-sky-300' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Eye size={12} />
                Visible
              </button>
              <button
                type="button"
                onClick={() => setVisibilidad('INTERNA')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                  visibilidad === 'INTERNA' ? 'bg-amber-500/15 text-amber-300' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LockKeyhole size={12} />
                Interna
              </button>
            </div>
            <button
              type="submit"
              disabled={!contenido.trim() || guardando}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c3aed] px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#6d28d9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando ? <RefreshCw size={13} className="animate-spin" /> : <Send size={13} />}
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

function MetricaPanel({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="px-2 py-1 text-center">
      <p className="text-xs font-semibold tabular-nums text-foreground">{valor}</p>
      <p className="text-[9px] text-muted-foreground">{etiqueta}</p>
    </div>
  )
}
