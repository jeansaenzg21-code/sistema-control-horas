'use client'

import {
  Users,
  CalendarRange,
  Percent,
  CheckCircle2,
  AlertTriangle,
  Target,
  FileWarning,
} from 'lucide-react'
import type { CumplimientoResumen } from '@/lib/cumplimiento'

interface Props {
  resumen: CumplimientoResumen
}

function KpiItem({
  etiqueta,
  valor,
  icono,
  fondoIcono,
  destacado,
  sub,
}: {
  etiqueta: string
  valor: string | number
  icono: React.ReactNode
  fondoIcono: string
  destacado?: boolean
  sub?: string
}) {
  return (
    <div
      className={`flex min-h-[88px] flex-col justify-between gap-2 overflow-hidden rounded-xl border border-border bg-card p-3 ${
        destacado ? 'border-[#7c3aed]/40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-muted-foreground">{etiqueta}</p>
        <span className={`shrink-0 rounded-md p-1.5 ${fondoIcono}`}>{icono}</span>
      </div>
      <div className="min-w-0">
        <p
          className={`font-bold tabular-nums leading-none text-foreground ${
            destacado ? 'text-xl text-[#c4b5fd]' : 'text-lg'
          }`}
        >
          {valor}
        </p>
        {sub && <p className="mt-1 truncate text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}

export function KpisCumplimiento({ resumen }: Props) {
  const {
    colaboradores,
    dias_exigibles,
    dias_reportados,
    cobertura,
    cumplen,
    cumplen_parcial,
    no_cumplen,
    registros_por_revisar,
  } = resumen

  return (
    <section>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiItem
          etiqueta="Colaboradores"
          valor={colaboradores}
          icono={<Users size={14} className="text-[#c4b5fd]" />}
          fondoIcono="bg-[#7c3aed]/10"
          sub="PERSONAL activos"
        />
        <KpiItem
          etiqueta="Días exigibles"
          valor={dias_exigibles}
          icono={<CalendarRange size={14} className="text-sky-400" />}
          fondoIcono="bg-sky-500/10"
          sub="Hábiles del período"
        />
        <KpiItem
          etiqueta="Cobertura global"
          valor={`${cobertura}%`}
          icono={<Percent size={14} className="text-fuchsia-400" />}
          fondoIcono="bg-fuchsia-500/10"
          destacado
          sub={`${dias_reportados} de ${dias_exigibles} días`}
        />
        <KpiItem
          etiqueta="Registros por revisar"
          valor={registros_por_revisar}
          icono={<FileWarning size={14} className="text-amber-400" />}
          fondoIcono="bg-amber-500/10"
          sub="Datos incompletos"
        />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        <KpiItem
          etiqueta="Cumplen"
          valor={cumplen}
          icono={<CheckCircle2 size={14} className="text-emerald-400" />}
          fondoIcono="bg-emerald-500/10"
          sub="Cobertura íntegra"
        />
        <KpiItem
          etiqueta="Cumplen parcial"
          valor={cumplen_parcial}
          icono={<Target size={14} className="text-amber-400" />}
          fondoIcono="bg-amber-500/10"
          sub="Requieren regularización"
        />
        <KpiItem
          etiqueta="No cumplen"
          valor={no_cumplen}
          icono={<AlertTriangle size={14} className="text-rose-400" />}
          fondoIcono="bg-rose-500/10"
        />
      </div>
    </section>
  )
}