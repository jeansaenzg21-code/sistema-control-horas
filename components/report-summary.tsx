'use client'

import { Clock, TrendingUp, Wallet, FileText } from 'lucide-react'
import type { Actividad } from '@/lib/types'

interface ReportSummaryProps {
  registros: Actividad[]
}

export function ReportSummary({ registros }: ReportSummaryProps) {
  const total = registros.reduce((acc, r) => acc + duracionAHoras(r.duracion ?? ''), 0)
  const facturables = registros
    .filter((r) => r.facturable)
    .reduce((acc, r) => acc + duracionAHoras(r.duracion ?? ''), 0)
  const noFacturables = total - facturables

  const tarjetas = [
    { etiqueta: 'Total de horas', valor: `${total.toFixed(1)}h`, icono: Clock, color: 'text-foreground' },
    { etiqueta: 'Horas facturables', valor: `${facturables.toFixed(1)}h`, icono: TrendingUp, color: 'text-[#c4b5fd]' },
    { etiqueta: 'Horas no facturables', valor: `${noFacturables.toFixed(1)}h`, icono: Wallet, color: 'text-muted-foreground' },
    { etiqueta: 'Registros', valor: String(registros.length), icono: FileText, color: 'text-foreground' },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {tarjetas.map((tarjeta) => (
        <div key={tarjeta.etiqueta} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <tarjeta.icono size={15} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{tarjeta.etiqueta}</span>
          </div>
          <p className={`text-xl font-bold ${tarjeta.color}`}>{tarjeta.valor}</p>
        </div>
      ))}
    </div>
  )
}

function duracionAHoras(duracion: string): number {
  const coincidencia = duracion.match(/(\d+)h(?:\s+(\d+)m)?/)
  if (!coincidencia) return 0
  return Number(coincidencia[1]) + (coincidencia[2] ? Number(coincidencia[2]) / 60 : 0)
}