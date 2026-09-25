'use client'

import { useMemo } from 'react'
import { TrendingUp, Wallet } from 'lucide-react'
import { KPICard } from './kpi-card'
import { useRegistros } from '@/lib/use-registros'
import { esFacturable, esNoFacturable, fechaLocalISO, formatoHoras } from '@/lib/utils'

interface BillingStatsProps {
  areaId?: string
  desde?: string
  hasta?: string
}

export function BillingStats({ areaId = '', desde = '', hasta = '' }: BillingStatsProps) {
  const registros = useRegistros()

  const horas = useMemo(() => {
    let enRango = registros
    if (areaId) enRango = enRango.filter((r) => String(r.area_id) === areaId)
    if (desde) enRango = enRango.filter((r) => fechaLocalISO(r.inicio) >= desde)
    if (hasta) enRango = enRango.filter((r) => fechaLocalISO(r.inicio) <= hasta)

    const calcularHoras = (r: { inicio: string; fin: string | null; pausa_acumulada_segundos: number }): number => {
      if (!r.fin || !r.inicio) return 0
      const diff = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000
      return Math.max(0, (diff - r.pausa_acumulada_segundos) / 3600)
    }

    const facturadas = enRango
      .filter((r) => r.estado === 'APROBADA' && esFacturable(r.facturable))
      .reduce((acc, r) => acc + calcularHoras(r), 0)
    const noFacturadas = enRango
      .filter(
        (r) =>
          r.estado === 'RECHAZADA' ||
          (r.estado === 'APROBADA' && esNoFacturable(r.facturable)),
      )
      .reduce((acc, r) => acc + calcularHoras(r), 0)
    const comparativa = facturadas + noFacturadas
    return { comparativa, facturadas, noFacturadas }
  }, [registros, areaId, desde, hasta])

  const pct = (valor: number) =>
    horas.comparativa === 0 ? '0.0' : ((valor / horas.comparativa) * 100).toFixed(1)

  return (
    <div className="flex h-full flex-col gap-3">
      <KPICard
        className="flex-1"
        titulo="Horas facturadas"
        valor={`${pct(horas.facturadas)}%`}
        icono={TrendingUp}
        color="verde"
        detalle={`${formatoHoras(horas.facturadas)} facturadas`}
      />
      <KPICard
        className="flex-1"
        titulo="Horas no facturadas"
        valor={`${pct(horas.noFacturadas)}%`}
        icono={Wallet}
        color="gris"
        detalle={`${formatoHoras(horas.noFacturadas)} no facturadas`}
      />
    </div>
  )
}
