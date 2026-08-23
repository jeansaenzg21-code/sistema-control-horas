'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Clock, Eye, ListChecks, User, X, XCircle } from 'lucide-react'
import { useActividad, type Actividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { StatusBadge } from './status-badge'
import { FacturableBadge } from './facturable-badge'
import { cn, esFacturable, esNoFacturable, fechaLocalISO } from '@/lib/utils'

type Filtro = 'pendientes' | 'aprobadas' | 'rechazadas'

const etiquetas: Record<Filtro, string> = {
  pendientes: 'Pendientes',
  aprobadas: 'Aprobadas',
  rechazadas: 'Rechazadas',
}

const iconos: Record<Filtro, React.ReactNode> = {
  pendientes: <Clock size={16} className="text-amber-400" />,
  aprobadas: <CheckCircle2 size={16} className="text-emerald-400" />,
  rechazadas: <XCircle size={16} className="text-rose-400" />,
}

export function ApprovalList() {
  const { historial } = useActividad()
  const { usuario, usuarios } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const [filtro, setFiltro] = useState<Filtro>(() => (esAdmin ? 'pendientes' : 'aprobadas'))
  const [detalle, setDetalle] = useState<Actividad | null>(null)
  const [decisiones, setDecisiones] = useState<Record<number, boolean>>({})
  const [seleccionadas, setSeleccionadas] = useState<Set<number>>(new Set())
  const [confirmarMasivo, setConfirmarMasivo] = useState(false)
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [aprobaciones, setAprobaciones] = useState<Actividad[]>([])

  const cargarAprobaciones = useCallback(async () => {
    if (!usuario) return
    try {
      let url = '/api/aprobaciones?'
      if (esAdmin) {
        url += `supervisor_id=${usuario.id}`
      } else {
        url += `usuario_id=${usuario.id}`
      }
      const res = await fetch(url)
      if (!res.ok) {
        console.warn('[aprobaciones] No se pudo cargar:', res.status)
        return
      }
      const data = await res.json()
      setAprobaciones(data)
    } catch {
      // Sin conexión
    }
  }, [usuario, esAdmin])

  useEffect(() => {
    setSeleccionadas(new Set())
    setModoSeleccion(false)
  }, [filtro])

  useEffect(() => {
    cargarAprobaciones()
  }, [cargarAprobaciones])

  const decisionPara = (actividad: Actividad): boolean =>
    decisiones[actividad.id] ?? actividad.facturable ?? true

  const marcarFacturable = (id: number, valor: boolean) =>
    setDecisiones((prev) => ({ ...prev, [id]: valor }))

  const todas = useMemo(() => {
    if (aprobaciones.length > 0) return aprobaciones
    if (esAdmin || !usuario) return historial
    return historial.filter(
      (a) => a.usuario_id === usuario.id,
    )
  }, [aprobaciones, historial, esAdmin, usuario])

  const filtrosVisibles: Filtro[] = esAdmin
    ? ['pendientes', 'aprobadas', 'rechazadas']
    : ['aprobadas', 'rechazadas']

  const conteos = useMemo(
    () => ({
      pendientes: todas.filter((a) => a.estado === 'PENDIENTE_APROBACION').length,
      aprobadas: todas.filter((a) => a.estado === 'APROBADA').length,
      rechazadas: todas.filter((a) => a.estado === 'RECHAZADA').length,
    }),
    [todas],
  )

  const filtradas = todas.filter((actividad) => actividad.estado === {
    pendientes: 'PENDIENTE_APROBACION',
    aprobadas: 'APROBADA',
    rechazadas: 'RECHAZADA',
  }[filtro])

  const pendientesIds = useMemo(
    () => todas.filter((a) => a.estado === 'PENDIENTE_APROBACION').map((a) => a.id),
    [todas],
  )

  const todasSeleccionadas =
    pendientesIds.length > 0 && pendientesIds.every((id) => seleccionadas.has(id))

  const alternarSeleccionarTodas = () => {
    if (todasSeleccionadas) {
      setSeleccionadas(new Set())
    } else {
      setSeleccionadas(new Set(pendientesIds))
    }
  }

  const alternarSeleccion = (id: number) => {
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) {
        nuevo.delete(id)
      } else {
        nuevo.add(id)
      }
      return nuevo
    })
  }

  const manejarAprobar = async (actividad: Actividad) => {
    if (!usuario) return
    const facturable = decisionPara(actividad)
    try {
      const res = await fetch(`/api/actividades/${actividad.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'APROBADA', revisado_por: usuario.id, facturable }),
      })
      if (!res.ok) {
        console.warn('[aprobaciones] No se pudo aprobar:', res.status)
        return
      }
      setDetalle(null)
      await cargarAprobaciones()
    } catch {
      console.warn('[aprobaciones] Sin conexión al aprobar')
    }
  }

  const manejarRechazar = async (actividad: Actividad) => {
    if (!usuario) return
    try {
      const res = await fetch(`/api/actividades/${actividad.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'RECHAZADA', revisado_por: usuario.id }),
      })
      if (!res.ok) {
        console.warn('[aprobaciones] No se pudo rechazar:', res.status)
        return
      }
      setDetalle(null)
      await cargarAprobaciones()
    } catch {
      console.warn('[aprobaciones] Sin conexión al rechazar')
    }
  }

  const aprobarSeleccionadas = async () => {
    if (!usuario) return
    for (const id of seleccionadas) {
      const actividad = todas.find((a) => a.id === id)
      if (!actividad) continue
      const facturable = decisionPara(actividad)
      try {
        const res = await fetch(`/api/actividades/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: 'APROBADA', revisado_por: usuario.id, facturable }),
        })
        if (!res.ok) console.warn('[aprobaciones] Fallo al aprobar id', id, res.status)
      } catch {
        console.warn('[aprobaciones] Sin conexión al aprobar id', id)
      }
    }
    setSeleccionadas(new Set())
    setConfirmarMasivo(false)
    await cargarAprobaciones()
  }

  return (
    <div className="space-y-5">
      <div className={cn('grid gap-4', esAdmin ? 'grid-cols-3' : 'grid-cols-2')}>
        {filtrosVisibles.map((clave) => (
          <button
            key={clave}
            onClick={() => setFiltro(clave)}
            className={cn(
              'rounded-xl border p-4 text-left transition-colors',
              filtro === clave
                ? 'border-[#7c3aed]/50 bg-[#7c3aed]/5'
                : 'border-border bg-card hover:border-[#7c3aed]/30',
            )}
          >
            <div className="mb-1.5 flex items-center gap-2">
              {iconos[clave]}
              <span className="text-sm text-muted-foreground">{etiquetas[clave]}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{conteos[clave]}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        {filtrosVisibles.map((clave) => (
          <button
            key={clave}
            onClick={() => setFiltro(clave)}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
              filtro === clave
                ? 'bg-[#7c3aed] text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {etiquetas[clave]}
          </button>
        ))}
      </div>

      {!esAdmin && (
        <div className="flex items-center gap-2.5 rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/5 px-4 py-3 text-sm text-foreground">
          <Bell size={15} className="shrink-0 text-[#c4b5fd]" />
          <p>
            Aquí solo ves los registros que el administrador aprobó o rechazó. Cuando decida
            sobre uno tuyo recibirás una notificación.
          </p>
        </div>
      )}

      {esAdmin && filtro === 'pendientes' && pendientesIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
          {modoSeleccion ? (
            <>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={todasSeleccionadas}
                  onChange={alternarSeleccionarTodas}
                  className="h-4 w-4 cursor-pointer accent-[#7c3aed]"
                />
                Seleccionar todas las pendientes
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setModoSeleccion(false)
                    setSeleccionadas(new Set())
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setConfirmarMasivo(true)}
                  disabled={seleccionadas.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <CheckCircle2 size={15} />
                  Aprobar seleccionadas ({seleccionadas.size})
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setModoSeleccion(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
            >
              <ListChecks size={15} />
              Seleccionar pendientes
            </button>
          )}
        </div>
      )}

      <div className="space-y-2.5">
        {filtradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center text-sm text-muted-foreground">
            No hay registros en esta categoría.
          </div>
        )}
        {filtradas.map((actividad) => (
          <div
            key={actividad.id}
            className="overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-[#7c3aed]/40"
          >
            <div className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                {actividad.estado === 'PENDIENTE_APROBACION' && modoSeleccion && (
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(actividad.id)}
                    onChange={() => alternarSeleccion(actividad.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#7c3aed]"
                  />
                )}
                <div className="shrink-0 text-muted-foreground">{iconos[etiquetaPorEstado(actividad.estado)]}</div>
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-foreground">{actividad.descripcion}</h3>
                  <p className="text-sm text-muted-foreground">
                    {actividad.tipo_actividad_nombre || actividad.especialidad} · {actividad.cliente_nombre ? `Cliente: ${actividad.cliente_nombre} · ` : ''}{fechaLocalISO(actividad.inicio)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <User size={12} />
                    Enviado por: <span className="font-medium text-foreground">{actividad.usuario_nombre ?? 'Desconocido'}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right">
                  <p className="font-semibold text-foreground">{formatDuracion(actividad)}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(actividad.inicio).split('T')[1]?.slice(0, 5) ?? '—'} – {actividad.fin ? String(actividad.fin).split('T')[1]?.slice(0, 5) : '—'}
                  </p>
                </div>
                <FacturableBadge valor={actividad.facturable} />
                <StatusBadge estado={actividad.estado} />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDetalle(actividad)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
                  >
                    <Eye size={14} />
                    Ver
                  </button>
                  {actividad.estado === 'PENDIENTE_APROBACION' && (
                    <>
                      <button
                        onClick={() => manejarAprobar(actividad)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
                      >
                        <CheckCircle2 size={14} />
                        Aprobar
                      </button>
                      <button
                        onClick={() => manejarRechazar(actividad)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700"
                      >
                        <XCircle size={14} />
                        Rechazar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {detalle && (
        <DetalleActividad
          actividad={detalle}
          facturable={decisionPara(detalle)}
          onFacturableChange={(valor) => marcarFacturable(detalle.id, valor)}
          onCerrar={() => setDetalle(null)}
          onAprobar={() => manejarAprobar(detalle)}
          onRechazar={() => manejarRechazar(detalle)}
        />
      )}

      {confirmarMasivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmarMasivo(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground">Aprobar actividades</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              ¿Deseas aprobar {seleccionadas.size}{' '}
              {seleccionadas.size === 1 ? 'actividad pendiente' : 'actividades pendientes'}?
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmarMasivo(false)}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
              >
                Cancelar
              </button>
              <button
                onClick={aprobarSeleccionadas}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <CheckCircle2 size={16} />
                Sí, aprobar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatDuracion(a: Actividad): string {
  if (a.fin && a.inicio) {
    const segs = a.pausa_acumulada_segundos || 0
    const inicio = new Date(a.inicio).getTime()
    const fin = new Date(a.fin).getTime()
    if (isNaN(inicio) || isNaN(fin)) return '—'
    const totalSeg = Math.floor((fin - inicio) / 1000) - segs
    if (totalSeg <= 0) return '—'
    const h = Math.floor(totalSeg / 3600)
    const m = Math.floor((totalSeg % 3600) / 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  }
  return '—'
}

function DetalleActividad({
  actividad,
  facturable,
  onFacturableChange,
  onCerrar,
  onAprobar,
  onRechazar,
}: {
  actividad: Actividad
  facturable: boolean
  onFacturableChange: (valor: boolean) => void
  onCerrar: () => void
  onAprobar: () => void
  onRechazar: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onCerrar}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{actividad.descripcion}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Enviado por: <span className="font-medium text-foreground">{actividad.usuario_nombre ?? 'Desconocido'}</span>
            </p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <CampoDetalle etiqueta="Especialidad" valor={actividad.especialidad || '—'} />
          <CampoDetalle etiqueta="Tipo" valor={actividad.tipo_actividad_nombre || '—'} />
          <CampoDetalle etiqueta="Cliente" valor={actividad.cliente_nombre || '—'} />
          <CampoDetalle etiqueta="Fecha" valor={fechaLocalISO(actividad.inicio)} />
          <CampoDetalle etiqueta="Horario" valor={`${String(actividad.inicio).split('T')[1]?.slice(0, 5) ?? '—'} – ${actividad.fin ? String(actividad.fin).split('T')[1]?.slice(0, 5) : '—'}`} />
          <CampoDetalle etiqueta="Duración" valor={formatDuracion(actividad)} />
          <div>
            <p className="text-xs text-muted-foreground">Facturable</p>
            {actividad.estado === 'PENDIENTE_APROBACION' ? (
              <div className="mt-1.5">
                <ControlFacturable valor={facturable} onChange={onFacturableChange} />
              </div>
            ) : (
              <p className="font-medium text-foreground">{esNoFacturable(actividad.facturable) ? 'No' : esFacturable(actividad.facturable) ? 'Sí' : 'Por definir'}</p>
            )}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Estado</p>
            <div className="mt-1">
              <StatusBadge estado={actividad.estado} />
            </div>
          </div>
        </div>

        {actividad.estado === 'PENDIENTE_APROBACION' && (
          <div className="mt-5 flex gap-3">
            <button
              onClick={onAprobar}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              <CheckCircle2 size={16} />
              Aprobar
            </button>
            <button
              onClick={onRechazar}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700"
            >
              <XCircle size={16} />
              Rechazar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ControlFacturable({
  valor,
  onChange,
}: {
  valor: boolean
  onChange: (valor: boolean) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-border bg-card p-0.5">
      {[true, false].map((opcion) => (
        <button
          key={String(opcion)}
          type="button"
          onClick={() => onChange(opcion)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            valor === opcion
              ? 'bg-[#7c3aed] text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opcion ? 'Facturable' : 'No facturable'}
        </button>
      ))}
    </div>
  )
}

function CampoDetalle({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className="font-medium text-foreground">{valor}</p>
    </div>
  )
}

function etiquetaPorEstado(estado: Actividad['estado']): Filtro {
  if (estado === 'PENDIENTE_APROBACION') return 'pendientes'
  if (estado === 'APROBADA') return 'aprobadas'
  return 'rechazadas'
}
