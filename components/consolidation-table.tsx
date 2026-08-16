'use client'

import { useMemo, useState } from 'react'
import { Clock, TrendingUp, Wallet, CalendarDays } from 'lucide-react'
import { StatusBadge } from './status-badge'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { duracionAHoras } from '@/lib/format'
import { REGISTROS_DEMO } from '@/lib/demo-data'
import { esJinez, registrosSimulacionJinez } from '@/lib/simulacion-jinez'
import type { Actividad } from '@/lib/types'
import { cn } from '@/lib/utils'

type FiltroFactura = 'todas' | 'facturadas' | 'no_facturadas'

interface GrupoUsuario {
  key: string
  nombre: string
  totalHoras: number
  registros: Actividad[]
}

export function ConsolidationTable() {
  const { historial } = useActividad()
  const { usuarios } = useAuth()
  const [filtro, setFiltro] = useState<FiltroFactura>('todas')

  const registros: Actividad[] = useMemo(() => {
    const base = historial.length > 0 ? historial : REGISTROS_DEMO
    const jinez = usuarios.find((u) => esJinez(u))
    if (!jinez) return base
    const simulacion = registrosSimulacionJinez(jinez)
    return [...base, ...simulacion.filter((s) => !base.some((r) => r.id === s.id))]
  }, [historial, usuarios])

  const gruposPorUsuario = useMemo(() => {
    const grupos = new Map<string, GrupoUsuario>()
    for (const r of registros) {
      const key = r.usuarioId ?? r.usuarioNombre ?? 'Sin usuario'
      const grupo = grupos.get(key) ?? { key, nombre: key, totalHoras: 0, registros: [] }
      grupo.registros.push(r)
      grupo.totalHoras += duracionAHoras(r.duracion)
      grupos.set(key, grupo)
    }
    return [...grupos.values()]
  }, [registros])

  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<string>(() => gruposPorUsuario[0]?.key ?? '')

  const grupoActual = gruposPorUsuario.find((g) => g.key === usuarioSeleccionado) ?? gruposPorUsuario[0]

  const filtradas = useMemo(() => {
    if (!grupoActual) return []
    if (filtro === 'facturadas') return grupoActual.registros.filter((r) => r.facturable === true)
    if (filtro === 'no_facturadas') return grupoActual.registros.filter((r) => r.facturable === false)
    return grupoActual.registros
  }, [grupoActual, filtro])

  const resumen = useMemo(
    () => ({
      total: registros.reduce((acc, r) => acc + duracionAHoras(r.duracion), 0),
      facturadas: registros
        .filter((r) => r.facturable === true)
        .reduce((acc, r) => acc + duracionAHoras(r.duracion), 0),
      noFacturadas: registros
        .filter((r) => r.facturable === false)
        .reduce((acc, r) => acc + duracionAHoras(r.duracion), 0),
      porDefinir: registros
        .filter((r) => r.facturable == null)
        .reduce((acc, r) => acc + duracionAHoras(r.duracion), 0),
    }),
    [registros],
  )

  const indicadores = [
    {
      etiqueta: 'Total de horas',
      valor: `${resumen.total.toFixed(2)}h`,
      icono: Clock,
      color: 'text-foreground',
    },
    {
      etiqueta: 'Horas facturadas',
      valor: `${resumen.facturadas.toFixed(2)}h`,
      icono: TrendingUp,
      color: 'text-emerald-400',
    },
    {
      etiqueta: 'Horas no facturadas',
      valor: `${resumen.noFacturadas.toFixed(2)}h`,
      icono: Wallet,
      color: 'text-muted-foreground',
    },
    {
      etiqueta: 'Por definir',
      valor: `${resumen.porDefinir.toFixed(2)}h`,
      icono: CalendarDays,
      color: 'text-[#c4b5fd]',
    },
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

      <div className="flex flex-wrap gap-2">
        {gruposPorUsuario.map((grupo) => (
          <button
            key={grupo.key}
            onClick={() => setUsuarioSeleccionado(grupo.key)}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors',
              grupo.key === grupoActual.key
                ? 'border-[#7c3aed] bg-[#7c3aed]/10 text-[#c4b5fd]'
                : 'border-border bg-card text-muted-foreground hover:border-border/60 hover:text-foreground',
            )}
          >
            <span>{grupo.nombre}</span>
            <span className="text-xs text-muted-foreground">{grupo.totalHoras.toFixed(2)}h</span>
          </button>
        ))}
      </div>

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

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">{grupoActual?.nombre}</h3>
          <span className="text-xs text-muted-foreground">
            Total: {(grupoActual?.totalHoras ?? 0).toFixed(2)}h
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Actividad
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground lg:table-cell">
                  Usuario
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
                  Especialidad
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Horas
                </th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
                  Fecha
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Facturado
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No hay registros que coincidan con el filtro.
                  </td>
                </tr>
              )}
              {filtradas.map((registro) => (
                <tr
                  key={registro.id}
                  className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-foreground">{registro.titulo}</p>
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">
                    {registro.usuarioNombre ?? '—'}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                    {registro.especialidad}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-foreground">
                    {registro.duracion}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                    {registro.fecha}
                  </td>
                  <td className="px-4 py-2.5">
                    <EtiquetaFacturado facturable={registro.facturable} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge estado={registro.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function EtiquetaFacturado({ facturable }: { facturable: boolean | null | undefined }) {
  if (facturable == null) {
    return (
      <span className="inline-flex rounded-full bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400">
        Por definir
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium',
        facturable
          ? 'bg-emerald-400/10 text-emerald-400'
          : 'bg-muted text-muted-foreground',
      )}
    >
      {facturable ? 'Facturado' : 'No facturado'}
    </span>
  )
}
