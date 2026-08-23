'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { DateRangeFilter } from '@/components/date-range-filter'
import { ChartCard } from '@/components/chart-card'
import { AreaChart } from '@/components/area-chart'
import { BillingStats } from '@/components/billing-stats'
import { ActivityTable } from '@/components/activity-table'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'

export default function PanelPrincipal() {
  const { areas } = useAreas()
  const { usuario, cargando } = useAuth()
  const router = useRouter()
  const [areaId, setAreaId] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (usuario.rol !== 'admin') {
      router.replace('/actividades')
    }
  }, [cargando, usuario, router])

  if (cargando || !usuario || usuario.rol !== 'admin') return null

  const estiloSelect =
    'w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/50'

  return (
    <MainLayout title="Panel Principal" subtitle="Resumen de tu actividad">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Building2 size={13} />
              Área
            </label>
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              className={estiloSelect}
            >
              <option value="">Selecciona un área</option>
              {areas.map((area) => (
                <option key={area.id} value={String(area.id)}>
                  {area.nombre}
                </option>
              ))}
            </select>
          </div>

          <DateRangeFilter
            desde={desde}
            hasta={hasta}
            disabled={!areaId}
            onChange={(d, h) => {
              setDesde(d)
              setHasta(h)
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ChartCard areaId={areaId} desde={desde} hasta={hasta} />
          <AreaChart areaId={areaId} desde={desde} hasta={hasta} />
          <BillingStats areaId={areaId} desde={desde} hasta={hasta} />
        </div>

        <ActivityTable areaId={areaId} desde={desde} hasta={hasta} />
      </div>
    </MainLayout>
  )
}
