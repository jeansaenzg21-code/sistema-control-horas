'use client'

import { useEffect, useMemo, useState } from 'react'
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Clock, TrendingUp, Wallet } from 'lucide-react'
import { StatusBadge } from './status-badge'
import { FacturableBadge } from './facturable-badge'
import { useActividad } from '@/lib/actividad-context'
import { useAreas } from '@/lib/areas-context'
import type { Actividad } from '@/lib/types'
import { cn, esFacturable, esNoFacturable, fechaLocalISO, formatoHoras } from '@/lib/utils'

type FiltroFactura = 'todas' | 'facturadas' | 'no_facturadas'

const REGISTROS_POR_PAGINA = 10

interface GrupoUsuario {
  key: string
  nombre: string
  totalHoras: number
  registros: Actividad[]
}

function calcSegundos(r: Actividad): number {
  if (!r.fin || !r.inicio) return 0
  const diff = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000
  return Math.max(0, diff - (r.pausa_acumulada_segundos || 0))
}

function esFacturada(r: Actividad): boolean {
  return r.estado === 'APROBADA' && esFacturable(r.facturable)
}

function esNoFacturada(r: Actividad): boolean {
  return r.estado === 'RECHAZADA' || (r.estado === 'APROBADA' && esNoFacturable(r.facturable))
}

export function ConsolidationTable() {
  const { historial } = useActividad()
  const { areas } = useAreas()
  const [areaId, setAreaId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filtro, setFiltro] = useState<FiltroFactura>('todas')

  const registros = useMemo(() => {
    return historial.filter((registro) => {
      if (areaId && String(registro.area_id ?? '') !== areaId) return false
      const fecha = fechaLocalISO(registro.inicio)
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
      return true
    })
  }, [areaId, desde, hasta, historial])

  const gruposPorUsuario = useMemo(() => {
    const grupos = new Map<string, GrupoUsuario>()
    for (const r of registros) {
      const key = r.usuario_nombre || 'Sin usuario'
      const grupo = grupos.get(key) ?? { key, nombre: key, totalHoras: 0, registros: [] }
      grupo.registros.push(r)
      grupo.totalHoras += calcSegundos(r) / 3600
      grupos.set(key, grupo)
    }
    return [...grupos.values()]
  }, [registros])

  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<string>(() => gruposPorUsuario[0]?.key ?? '')
  const [pagina, setPagina] = useState(1)

  const grupoActual = gruposPorUsuario.find((g) => g.key === usuarioSeleccionado) ?? gruposPorUsuario[0]

  const filtradas = useMemo(() => {
    if (!grupoActual) return []
    if (filtro === 'facturadas') return grupoActual.registros.filter((r) => esFacturada(r))
    if (filtro === 'no_facturadas') return grupoActual.registros.filter((r) => esNoFacturada(r))
    return grupoActual.registros
  }, [grupoActual, filtro])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / REGISTROS_POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicioPagina = (paginaActual - 1) * REGISTROS_POR_PAGINA
  const filtradasPagina = filtradas.slice(inicioPagina, inicioPagina + REGISTROS_POR_PAGINA)

  useEffect(() => {
    setPagina(1)
  }, [areaId, desde, hasta, filtro, usuarioSeleccionado])

  const resumen = useMemo(
    () => ({
      total: registros.reduce((acc, r) => acc + calcSegundos(r) / 3600, 0),
      facturadas: registros.filter((r) => esFacturada(r)).reduce((acc, r) => acc + calcSegundos(r) / 3600, 0),
      noFacturadas: registros.filter((r) => esNoFacturada(r)).reduce((acc, r) => acc + calcSegundos(r) / 3600, 0),
      porDefinir: registros
        .filter((r) => !esFacturada(r) && !esNoFacturada(r))
        .reduce((acc, r) => acc + calcSegundos(r) / 3600, 0),
    }),
    [registros],
  )

  const indicadores = [
    { etiqueta: 'Total de horas', valor: formatoHoras(resumen.total), icono: Clock, color: 'text-foreground' },
    { etiqueta: 'Horas facturadas', valor: formatoHoras(resumen.facturadas), icono: TrendingUp, color: 'text-emerald-400' },
    { etiqueta: 'Horas no facturadas', valor: formatoHoras(resumen.noFacturadas), icono: Wallet, color: 'text-muted-foreground' },
    { etiqueta: 'Por definir', valor: formatoHoras(resumen.porDefinir), icono: CalendarDays, color: 'text-[#c4b5fd]' },
  ]

  const opciones: { valor: FiltroFactura; etiqueta: string }[] = [
    { valor: 'todas', etiqueta: 'Todas' },
    { valor: 'facturadas', etiqueta: 'Facturadas' },
    { valor: 'no_facturadas', etiqueta: 'No facturadas' },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {indicadores.map((indicador) => (
          <div key={indicador.etiqueta} className="rounded-xl border border-border bg-card p-4">
            <div className="mb-1 flex items-center gap-2">
              <indicador.icono size={15} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{indicador.etiqueta}</span>
            </div>
            <p className={cn('text-xl font-bold', indicador.color)}>{indicador.valor}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {gruposPorUsuario.map((grupo) => (
          <button
            key={grupo.key}
            onClick={() => setUsuarioSeleccionado(grupo.key)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
              grupo.key === grupoActual?.key
                ? 'border-[#7c3aed] bg-[#7c3aed]/10 text-[#c4b5fd]'
                : 'border-border bg-card text-muted-foreground hover:border-border/60 hover:text-foreground',
            )}
          >
            <span>{grupo.nombre}</span>
            <span className="text-xs text-muted-foreground">{formatoHoras(grupo.totalHoras)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
          {opciones.map((opcion) => (
            <button
              key={opcion.valor}
              onClick={() => setFiltro(opcion.valor)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
                filtro === opcion.valor
                  ? 'bg-[#7c3aed] text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opcion.etiqueta}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-end gap-1.5">
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Building2 size={11} />
            <span>División</span>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground focus:border-[#7c3aed]/50 focus:outline-none">
              <option value="">Todas</option>
              {areas.map((area) => <option key={area.id} value={String(area.id)}>{area.nombre}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CalendarDays size={11} />
            <span>Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground focus:border-[#7c3aed]/50 focus:outline-none" />
          </label>
          <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span>Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-8 rounded-lg border border-border bg-background px-2 text-[11px] text-foreground focus:border-[#7c3aed]/50 focus:outline-none" />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Actividad', 'Usuario', 'Duración', 'Estado', 'Facturación', 'Fecha'].map((encabezado) => (
                <th
                  key={encabezado}
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradasPagina.map((actividad) => (
              <tr
                key={actividad.id}
                className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{actividad.descripcion}</p>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{actividad.usuario_nombre ?? '—'}</td>
                <td className="px-3 py-2 font-medium text-foreground">{formatDuracion(actividad)}</td>
                <td className="px-3 py-2">
                  <StatusBadge estado={actividad.estado} />
                </td>
                <td className="px-3 py-2">
                  <FacturableBadge valor={actividad.facturable} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fechaLocalISO(actividad.inicio)}</td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No hay registros en esta categoría.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtradas.length > REGISTROS_POR_PAGINA && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>Mostrando {inicioPagina + 1}-{Math.min(inicioPagina + REGISTROS_POR_PAGINA, filtradas.length)} de {filtradas.length}</span>
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
      </div>
    </div>
  )
}

function formatDuracion(r: Actividad): string {
  if (!r.fin || !r.inicio) return '—'
  const totalSeg = Math.max(0, (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000 - (r.pausa_acumulada_segundos || 0))
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
