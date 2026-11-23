'use client'

import { AlertTriangle, MessageSquare, Users } from 'lucide-react'
import type { ColaboradorCumplimiento } from '@/lib/cumplimiento'
import type { CumplimientoObservacion } from '@/lib/observaciones-ui'
import styles from './cumplimiento.module.css'
import { cn, formatoHoras } from '@/lib/utils'

interface Props {
  colaboradores: ColaboradorCumplimiento[]
  observaciones?: Record<number, CumplimientoObservacion[] | string>
  onAbrirObservaciones?: (colaborador: ColaboradorCumplimiento) => void
}

const CLASE_BADGE_ESTADO: Record<ColaboradorCumplimiento['estado'], string> = {
  CUMPLE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  CUMPLE_PARCIAL: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  NO_CUMPLE: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
}

const ETIQUETA_ESTADO: Record<ColaboradorCumplimiento['estado'], string> = {
  CUMPLE: 'CUMPLE',
  CUMPLE_PARCIAL: 'CUMPLE PARCIAL',
  NO_CUMPLE: 'NO CUMPLE',
}

function cantidadObservaciones(valor: CumplimientoObservacion[] | string | undefined): number {
  if (Array.isArray(valor)) return valor.length
  return valor?.trim() ? 1 : 0
}

export function ResumenColaboradores({
  colaboradores,
  observaciones = {},
  onAbrirObservaciones,
}: Props) {
  if (colaboradores.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        No hay colaboradores activos para evaluar en este período.
      </section>
    )
  }

  return (
    <section className={styles.panel}>
      <div className={styles.heading}>
        <h2 className={styles.headingTitle}>
          <Users size={21} aria-hidden="true" />
          Situación por colaborador
        </h2>
        <span className={styles.count}>
          {colaboradores.length} colaborador(es)
        </span>
      </div>

      <div className={styles.tableScroll} role="region" aria-label="Situación por colaborador" tabIndex={0}>
        <table className={styles.table}>
          <colgroup>
            <col className="w-[25%]" />
            <col className="w-[11%]" />
            <col className="w-[12%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[19%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-2 text-left text-[11px] font-medium text-muted-foreground">Colaborador</th>
              <th scope="col" className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">Cobertura</th>
              <th scope="col" className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">Estado</th>
              <th scope="col" className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">Registros</th>
              <th scope="col" className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">Horas</th>
              <th scope="col" className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">Semanas</th>
              <th scope="col" className="px-2 py-2 text-left text-[11px] font-medium text-muted-foreground">Observación</th>
              <th scope="col" className="px-1 py-2 text-center text-[11px] font-medium text-muted-foreground">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.map((c) => {
              const cantidad = cantidadObservaciones(observaciones[c.id])
              return (
                <tr
                  key={c.id}
                  className="border-b border-border/50 align-top transition-colors hover:bg-[#7c3aed]/5"
                >
                  <td className="min-w-0 px-4 py-2">
                    <p className="truncate text-xs font-semibold text-foreground" title={c.nombre}>
                      {c.nombre}
                    </p>
                    <p
                      className="truncate text-[10px] text-muted-foreground"
                      title={`${c.area_nombre || 'Sin división'}${c.cargo ? ` · ${c.cargo}` : ''}`}
                    >
                      {c.area_nombre || 'Sin división'}
                      {c.cargo ? ` · ${c.cargo}` : ''}
                    </p>
                  </td>
                  <td className="min-w-0 px-2 py-2 text-center align-middle">
                    <div className="flex min-w-0 items-center justify-center gap-2">
                      <div className={styles.coverage}>
                        <div
                          className={styles.coverageFill}
                          style={{ width: `${Math.min(100, c.cobertura)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums text-foreground">
                        {c.cobertura}%
                      </span>
                    </div>
                  </td>
                  <td className="min-w-0 px-2 py-2 text-center align-middle">
                    <span className={cn(
                      'inline-block max-w-full whitespace-normal rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold leading-tight',
                      CLASE_BADGE_ESTADO[c.estado],
                    )}>
                      {ETIQUETA_ESTADO[c.estado]}
                    </span>
                  </td>
                  <td className="min-w-0 px-2 py-2 text-center align-middle text-xs tabular-nums text-muted-foreground">
                    {c.registros}
                  </td>
                  <td className="min-w-0 break-words px-2 py-2 text-center align-middle text-xs tabular-nums text-muted-foreground">
                    {formatoHoras(c.horas_totales)}
                  </td>
                  <td className="min-w-0 px-2 py-2 text-center align-middle text-xs tabular-nums text-muted-foreground">
                    {c.semanas_reportadas}/{c.semanas_exigidas}
                  </td>
                  <td className="min-w-0 px-2 py-2 align-middle">
                    {c.observacion ? (
                      <p
                        className="truncate text-[11px] italic leading-snug text-muted-foreground"
                        title={c.observacion}
                      >
                        {c.observacion}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/50">—</p>
                    )}
                  </td>
                  <td className="min-w-0 px-1 py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => onAbrirObservaciones?.(c)}
                      className={cn(
                        'inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-1.5 py-1 text-xs font-medium transition-colors',
                        cantidad > 0
                          ? 'border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15'
                          : 'border-border text-muted-foreground hover:border-amber-500/35 hover:bg-amber-500/5 hover:text-amber-300',
                      )}
                      aria-label={`Observaciones de ${c.nombre} (${cantidad})`}
                      title={cantidad > 0 ? `${cantidad} observación(es)` : 'Abrir observaciones'}
                    >
                      <MessageSquare size={13} />
                      <span className="tabular-nums">{cantidad}</span>
                      {cantidad > 0 && <AlertTriangle size={11} className="text-amber-400" />}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
