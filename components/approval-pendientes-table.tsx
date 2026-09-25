'use client'

import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Eye, FileWarning, XCircle } from 'lucide-react'
import type { Actividad } from '@/lib/actividad-context'
import { datosFaltantesActividad, textoDatosFaltantes } from '@/lib/cumplimiento'
import { cn, fechaLocalISO } from '@/lib/utils'
import { StatusBadge } from './status-badge'

interface Props {
  actividades: Actividad[]
  modoSeleccion: boolean
  seleccionadas: Set<number>
  onAlternar: (id: number) => void
  onVer: (actividad: Actividad) => void
  onAprobar: (actividad: Actividad) => void
  onRechazar: (actividad: Actividad) => void
}

const VISIBLES_INICIALES = 10

export function ApprovalPendientesTable({
  actividades,
  modoSeleccion,
  seleccionadas,
  onAlternar,
  onVer,
  onAprobar,
  onRechazar,
}: Props) {
  const [verTodos, setVerTodos] = useState(false)
  const visibles = verTodos ? actividades : actividades.slice(0, VISIBLES_INICIALES)
  const hayMas = actividades.length > VISIBLES_INICIALES

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <FileWarning size={15} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-foreground">
            Registros por revisar{' '}
            <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-400 tabular-nums">
              {actividades.length}
            </span>
          </h2>
          <p className="hidden text-[11px] text-muted-foreground md:inline">
            Actividades pendientes de aprobación
          </p>
        </div>
        {hayMas && (
          <button
            onClick={() => setVerTodos(!verTodos)}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {verTodos ? (
              <>
                <ChevronUp size={12} />
                Ver menos
              </>
            ) : (
              <>
                <ChevronDown size={12} />
                Ver todos ({actividades.length})
              </>
            )}
          </button>
        )}
      </div>

      {actividades.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
          <CheckCircle2 size={15} className="text-emerald-400" />
          No hay registros por revisar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {modoSeleccion && (
                  <th className="w-10 px-3 py-2 text-[11px] font-medium text-muted-foreground">
                    sel.
                  </th>
                )}
                <th className="w-[15%] px-4 py-2 text-[11px] font-medium text-muted-foreground">Colaborador</th>
                <th className="w-[11%] px-3 py-2 text-[11px] font-medium text-muted-foreground">Fecha</th>
                <th className="w-auto px-3 py-2 text-[11px] font-medium text-muted-foreground">Cliente</th>
                <th className="w-[26%] px-3 py-2 text-[11px] font-medium text-muted-foreground">Actividad</th>
                <th className="w-[9%] px-3 py-2 text-[11px] font-medium text-muted-foreground">Horas</th>
                <th className="w-[16%] px-3 py-2 text-[11px] font-medium text-muted-foreground">Dato faltante</th>
                <th className="w-[12%] px-3 py-2 text-[11px] font-medium text-muted-foreground">Estado</th>
                <th className="w-[19%] px-3 py-2 text-[11px] font-medium text-muted-foreground">Acción</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const faltantes = datosFaltantesActividad(a)
                return (
                  <tr key={a.id} className="border-b border-border/50 align-top transition-colors hover:bg-[#7c3aed]/5">
                    {modoSeleccion && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={seleccionadas.has(a.id)}
                          onChange={() => onAlternar(a.id)}
                          className="h-4 w-4 cursor-pointer accent-[#7c3aed]"
                        />
                      </td>
                    )}
                    <td className="px-4 py-2 text-xs font-medium text-foreground">{a.usuario_nombre ?? 'Desconocido'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {fechaLocalISO(a.inicio)}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{a.cliente_nombre ?? '—'}</td>
                    <td className="break-words px-3 py-2 text-xs text-muted-foreground" title={a.descripcion ?? ''}>
                      {a.descripcion ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                      {formatHoras(a)}
                    </td>
                    <td className="px-3 py-2">
                      {faltantes.length > 0 ? (
                        <span className="inline-flex whitespace-normal rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold leading-snug text-rose-400">
                          {textoDatosFaltantes(faltantes)}
                        </span>
                      ) : (
                        <span className="inline-flex whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Completo
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge estado={a.estado} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1.5 whitespace-nowrap">
                        <button
                          onClick={() => onVer(a)}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
                        >
                          <Eye size={12} />
                          Ver
                        </button>
                        <button
                          onClick={() => onAprobar(a)}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:opacity-90',
                            'bg-emerald-600 hover:bg-emerald-700',
                          )}
                        >
                          <CheckCircle2 size={12} />
                          Aprobar
                        </button>
                        <button
                          onClick={() => onRechazar(a)}
                          className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-rose-700"
                        >
                          <XCircle size={12} />
                          Rechazar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function formatHoras(a: Actividad): string {
  if (!a.fin || !a.inicio) return '—'
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
