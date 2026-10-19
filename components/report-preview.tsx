'use client'

import { ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { FiltrosReporte } from './report-filters'
import { StatusBadge } from './status-badge'
import { FacturableBadge } from './facturable-badge'
import type { Actividad } from '@/lib/types'
import { fechaLocalISO } from '@/lib/utils'

const REGISTROS_POR_PAGINA = 10

interface ReportPreviewProps {
  filtros: FiltrosReporte
  registros: Actividad[]
  onExportar: () => void
}

export function ReportPreview({ filtros, registros, onExportar }: ReportPreviewProps) {
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    setPagina(1)
  }, [registros])

  const totalPaginas = Math.max(1, Math.ceil(registros.length / REGISTROS_POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicioPagina = (paginaActual - 1) * REGISTROS_POR_PAGINA
  const registrosPagina = registros.slice(inicioPagina, inicioPagina + REGISTROS_POR_PAGINA)

  const formatDuracion = (r: Actividad): string => {
    if (!r.fin || !r.inicio) return '—'
    const totalSeg = Math.max(0, (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000 - (r.pausa_acumulada_segundos || 0))
    const h = Math.floor(totalSeg / 3600)
    const m = Math.floor((totalSeg % 3600) / 60)
    if (h === 0) return `${m}min`
    if (m === 0) return `${h}h`
    return `${h}h ${m}min`
  }

  return (
    <div className="print-area overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Vista previa</h2>
          <p className="text-xs text-muted-foreground">
            {tituloTipo(filtros.tipo)} · {filtros.desde || '—'} al {filtros.hasta || '—'}
          </p>
        </div>
        <button
          onClick={onExportar}
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#c4b5fd]"
        >
          <FileSpreadsheet size={16} className="text-emerald-400" />
          Exportar Excel
        </button>
      </div>

      {registros.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No hay actividades registradas en esa fecha.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Actividad', 'Cliente', 'Usuario', 'Cargo', 'Duración', 'Facturable', 'Estado'].map((encabezado) => (
                    <th
                      key={encabezado}
                      className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      {encabezado}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registrosPagina.map((registro) => (
                  <tr
                    key={registro.id}
                    className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-foreground">{registro.descripcion}</p>
                      <p className="text-xs text-muted-foreground">{fechaLocalISO(registro.inicio)}</p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{registro.cliente_nombre ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{registro.usuario_nombre ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{registro.cargo || '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {formatDuracion(registro)}
                    </td>
                    <td className="px-4 py-2.5">
                      <FacturableBadge valor={registro.facturable} />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge estado={registro.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {registros.length > REGISTROS_POR_PAGINA && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2 text-xs text-muted-foreground">
              <span>Mostrando {inicioPagina + 1}-{Math.min(inicioPagina + REGISTROS_POR_PAGINA, registros.length)} de {registros.length}</span>
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => setPagina((valor) => Math.max(1, valor - 1))} disabled={paginaActual === 1} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página anterior">
                  <ChevronLeft size={12} />
                  Anterior
                </button>
                <span className="px-1 tabular-nums">{paginaActual} / {totalPaginas}</span>
                <button type="button" onClick={() => setPagina((valor) => Math.min(totalPaginas, valor + 1))} disabled={paginaActual === totalPaginas} className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40" aria-label="Página siguiente">
                  Siguiente
                  <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function tituloTipo(tipo: string): string {
  const titulos: Record<string, string> = {
    mensual: 'Reporte mensual',
    proyecto: 'Reporte por proyecto',
    cargo: 'Reporte por cargo',
    facturacion: 'Reporte de facturación',
  }
  return titulos[tipo] ?? 'Reporte'
}
