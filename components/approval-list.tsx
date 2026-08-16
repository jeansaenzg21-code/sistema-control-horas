'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Clock, Eye, ListChecks, User, X, XCircle } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { esJinez, registrosSimulacionJinez } from '@/lib/simulacion-jinez'
import { StatusBadge } from './status-badge'
import type { Actividad } from '@/lib/types'
import { cn } from '@/lib/utils'

type Filtro = 'pendientes' | 'aprobadas' | 'rechazadas'

const plantillas: Actividad[] = [
  {
    id: 'demo-1',
    titulo: 'Elaboración de contrato comercial',
    especialidad: 'Corporativo',
    tipo: 'Redacción de contrato',
    facturable: null,
    fecha: '31 de julio, 2025',
    horaInicio: '09:00',
    iniciadaEn: 0,
    horaFin: '12:30',
    duracion: '3h 30m',
    estado: 'pendiente_aprobacion',
    usuarioNombre: 'Carlos Mendoza',
  },
  {
    id: 'demo-2',
    titulo: 'Revisión de documentación tributaria',
    especialidad: 'Tributario',
    tipo: 'Revisión de documentación',
    facturable: true,
    fecha: '30 de julio, 2025',
    horaInicio: '14:00',
    iniciadaEn: 0,
    horaFin: '16:45',
    duracion: '2h 45m',
    estado: 'aprobada',
    usuarioNombre: 'Carlos Mendoza',
  },
  {
    id: 'demo-3',
    titulo: 'Consultoría laboral - Empresa XYZ',
    especialidad: 'Laboral',
    tipo: 'Consultoría legal',
    facturable: true,
    fecha: '29 de julio, 2025',
    horaInicio: '10:30',
    iniciadaEn: 0,
    horaFin: '13:00',
    duracion: '2h 30m',
    estado: 'aprobada',
    usuarioNombre: 'Rosa Gutiérrez',
  },
  {
    id: 'demo-4',
    titulo: 'Llamada con cliente - Seguimiento de caso',
    especialidad: 'Corporativo',
    tipo: 'Reunión con cliente',
    facturable: true,
    fecha: '28 de julio, 2025',
    horaInicio: '11:00',
    iniciadaEn: 0,
    horaFin: '12:00',
    duracion: '1h 00m',
    estado: 'rechazada',
    usuarioNombre: 'Rosa Gutiérrez',
  },
]

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
  const { historial, aprobarActividad, rechazarActividad } = useActividad()
  const { usuario } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const [filtro, setFiltro] = useState<Filtro>(() => (esAdmin ? 'pendientes' : 'aprobadas'))
  const [detalle, setDetalle] = useState<Actividad | null>(null)
  const [demo, setDemo] = useState<Actividad[]>(plantillas)
  const [decisiones, setDecisiones] = useState<Record<string, boolean>>({})
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [confirmarMasivo, setConfirmarMasivo] = useState(false)
  const [modoSeleccion, setModoSeleccion] = useState(false)

  useEffect(() => {
    setSeleccionadas(new Set())
    setModoSeleccion(false)
  }, [filtro])

  const decisionPara = (actividad: Actividad): boolean =>
    decisiones[actividad.id] ?? actividad.facturable ?? true

  const marcarFacturable = (id: string, valor: boolean) =>
    setDecisiones((prev) => ({ ...prev, [id]: valor }))

  const todas = useMemo(() => {
    let combinadas: Actividad[] = [...historial, ...demo]
    if (usuario && esJinez(usuario)) {
      const simulacion = registrosSimulacionJinez(usuario).filter(
        (s) => s.estado === 'aprobada' || s.estado === 'rechazada',
      )
      combinadas = [...combinadas, ...simulacion]
    }
    if (esAdmin || !usuario) return combinadas
    return combinadas.filter(
      (a) =>
        (a.usuarioId && a.usuarioId === usuario.id) ||
        (!a.usuarioId && a.usuarioNombre === usuario.nombre),
    )
  }, [historial, demo, esAdmin, usuario])

  const filtrosVisibles: Filtro[] = esAdmin
    ? ['pendientes', 'aprobadas', 'rechazadas']
    : ['aprobadas', 'rechazadas']

  const conteos = useMemo(
    () => ({
      pendientes: todas.filter((a) => a.estado === 'pendiente_aprobacion').length,
      aprobadas: todas.filter((a) => a.estado === 'aprobada').length,
      rechazadas: todas.filter((a) => a.estado === 'rechazada').length,
    }),
    [todas],
  )

  const filtradas = todas.filter((actividad) => actividad.estado === {
    pendientes: 'pendiente_aprobacion',
    aprobadas: 'aprobada',
    rechazadas: 'rechazada',
  }[filtro])

  const pendientesIds = useMemo(
    () => todas.filter((a) => a.estado === 'pendiente_aprobacion').map((a) => a.id),
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

  const alternarSeleccion = (id: string) => {
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

  const manejarAprobar = (actividad: Actividad) => {
    const facturable = decisionPara(actividad)
    aprobarActividad(actividad.id, facturable)
    setDemo((prev) =>
      prev.map((a) => (a.id === actividad.id ? { ...a, estado: 'aprobada' as const, facturable } : a)),
    )
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev)
      nuevo.delete(actividad.id)
      return nuevo
    })
    if (detalle?.id === actividad.id) setDetalle(null)
  }

  const manejarRechazar = (actividad: Actividad) => {
    rechazarActividad(actividad.id)
    setDemo((prev) => prev.map((a) => (a.id === actividad.id ? { ...a, estado: 'rechazada' as const } : a)))
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev)
      nuevo.delete(actividad.id)
      return nuevo
    })
    if (detalle?.id === actividad.id) setDetalle(null)
  }

  const aprobarSeleccionadas = () => {
    for (const id of seleccionadas) {
      const actividad = todas.find((a) => a.id === id)
      if (!actividad) continue
      const facturable = decisionPara(actividad)
      aprobarActividad(id, facturable)
      setDemo((prev) =>
        prev.map((a) => (a.id === id ? { ...a, estado: 'aprobada' as const, facturable } : a)),
      )
    }
    setSeleccionadas(new Set())
    setConfirmarMasivo(false)
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
            sobre uno tuyo recibirás una notificación en la campana.
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
                {actividad.estado === 'pendiente_aprobacion' && modoSeleccion && (
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(actividad.id)}
                    onChange={() => alternarSeleccion(actividad.id)}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#7c3aed]"
                  />
                )}
                <div className="shrink-0 text-muted-foreground">{iconos[etiquetaPorEstado(actividad.estado)]}</div>
                <div className="min-w-0">
                  <h3 className="truncate font-medium text-foreground">{actividad.titulo}</h3>
                  <p className="text-sm text-muted-foreground">
                    {actividad.especialidad} · {actividad.fecha}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <User size={12} />
                    Enviado por: <span className="font-medium text-foreground">{actividad.usuarioNombre ?? 'Desconocido'}</span>
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right">
                  <p className="font-semibold text-foreground">{actividad.duracion ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {actividad.horaInicio} – {actividad.horaFin ?? '—'}
                  </p>
                </div>
                <StatusBadge estado={actividad.estado} />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDetalle(actividad)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
                  >
                    <Eye size={14} />
                    Ver
                  </button>
                  {actividad.estado === 'pendiente_aprobacion' && (
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
            <h2 className="text-lg font-semibold text-foreground">{actividad.titulo}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Enviado por: <span className="font-medium text-foreground">{actividad.usuarioNombre ?? 'Desconocido'}</span>
            </p>
          </div>
          <button onClick={onCerrar} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <CampoDetalle etiqueta="Especialidad" valor={actividad.especialidad} />
          <CampoDetalle etiqueta="Tipo" valor={actividad.tipo} />
          <CampoDetalle etiqueta="Fecha" valor={actividad.fecha} />
          <CampoDetalle etiqueta="Horario" valor={`${actividad.horaInicio} – ${actividad.horaFin ?? '—'}`} />
          <CampoDetalle etiqueta="Duración" valor={actividad.duracion ?? '—'} />
          <div>
            <p className="text-xs text-muted-foreground">Facturable</p>
            {actividad.estado === 'pendiente_aprobacion' ? (
              <div className="mt-1.5">
                <ControlFacturable valor={facturable} onChange={onFacturableChange} />
              </div>
            ) : (
              <p className="font-medium text-foreground">{etiquetaFacturable(actividad.facturable)}</p>
            )}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground">Estado</p>
            <div className="mt-1">
              <StatusBadge estado={actividad.estado} />
            </div>
          </div>
        </div>

        {actividad.estado === 'pendiente_aprobacion' && (
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

function etiquetaFacturable(facturable: boolean | null | undefined): string {
  if (facturable == null) return 'Por definir'
  return facturable ? 'Sí' : 'No'
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
  if (estado === 'pendiente_aprobacion') return 'pendientes'
  if (estado === 'aprobada') return 'aprobadas'
  return 'rechazadas'
}
