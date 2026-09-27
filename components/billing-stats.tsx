'use client'

import { useMemo } from 'react'
import { TrendingUp, Wallet } from 'lucide-react'
import { KPICard } from './kpi-card'
import { useResumenActividades } from '@/lib/use-resumen'
import { esFacturable, esNoFacturable, fechaLocalISO, formatoHoras } from '@/lib/utils'

interface BillingStatsProps {
  areaId?: string
  desde?: string
  hasta?: string
}

export function BillingStats({ areaId = '', desde = '', hasta = '' }: BillingStatsProps) {
  // Los tres totales se agregan en el servidor, no sumando filas en el navegador.
  const { resumen } = useResumenActividades({ desde, hasta, areaId })

  const horas = useMemo(() => {
    const t = resumen.totales
    return { comparativa: t.horas_facturadas + t.horas_no_facturadas, facturadas: t.horas_facturadas, noFacturadas: t.horas_no_facturadas }
  }, [resumen.totales])

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
