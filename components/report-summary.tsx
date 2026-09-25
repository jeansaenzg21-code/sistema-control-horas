'use client'

import { Clock, TrendingUp, Wallet, FileText } from 'lucide-react'
import type { Actividad } from '@/lib/types'
import { esFacturable, esNoFacturable, formatoHoras } from '@/lib/utils'

interface ReportSummaryProps {
  registros: Actividad[]
}

export function ReportSummary({ registros }: ReportSummaryProps) {
  const calcularHoras = (r: Actividad): number => {
    if (!r.fin || !r.inicio) return 0
    const diff = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000
    return Math.max(0, (diff - (r.pausa_acumulada_segundos || 0)) / 3600)
  }

  const total = registros.reduce((acc, r) => acc + calcularHoras(r), 0)
  const facturables = registros
    .filter((r) => r.estado === 'APROBADA' && esFacturable(r.facturable))
    .reduce((acc, r) => acc + calcularHoras(r), 0)
  const noFacturables = registros
    .filter(
      (r) =>
        r.estado === 'RECHAZADA' ||
        (r.estado === 'APROBADA' && esNoFacturable(r.facturable)),
    )
    .reduce((acc, r) => acc + calcularHoras(r), 0)

  const tarjetas = [
    { etiqueta: 'Total de horas', valor: formatoHoras(total), icono: Clock, color: 'text-foreground' },
    { etiqueta: 'Horas facturables', valor: formatoHoras(facturables), icono: TrendingUp, color: 'text-[#c4b5fd]' },
    { etiqueta: 'Horas no facturables', valor: formatoHoras(noFacturables), icono: Wallet, color: 'text-muted-foreground' },
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
