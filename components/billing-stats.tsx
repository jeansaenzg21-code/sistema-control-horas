'use client'

import { useMemo } from 'react'
import { TrendingUp, Wallet } from 'lucide-react'
import { KPICard } from './kpi-card'
import { duracionAHoras, fechaEnRango } from '@/lib/format'
import { useRegistros } from '@/lib/use-registros'

interface BillingStatsProps {
  areaId?: string
  desde?: string
  hasta?: string
}

export function BillingStats({ areaId = '', desde = '', hasta = '' }: BillingStatsProps) {
  const registros = useRegistros()

  const horas = useMemo(() => {
    const enRango = registros.filter(
      (r) => (!areaId || r.areaId === areaId) && fechaEnRango(r.fecha, desde, hasta),
    )
    const facturadas = enRango
      .filter((r) => r.estado === 'aprobada' && r.facturable === true)
      .reduce((acc, r) => acc + duracionAHoras(r.duracion), 0)
    const noFacturadas = enRango
      .filter((r) => r.estado === 'aprobada' && r.facturable === false)
      .reduce((acc, r) => acc + duracionAHoras(r.duracion), 0)
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
        detalle={`${horas.facturadas.toFixed(1)}h facturadas`}
      />
      <KPICard
        className="flex-1"
        titulo="Horas no facturadas"
        valor={`${pct(horas.noFacturadas)}%`}
        icono={Wallet}
        color="gris"
        detalle={`${horas.noFacturadas.toFixed(1)}h no facturadas`}
      />
    </div>
  )
}
