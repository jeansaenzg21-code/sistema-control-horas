'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { DashboardJefeArea } from '@/components/dashboard-jefe-area'
import { DashboardAdministrador } from '@/components/dashboard-admin'
import { DateRangeFilter } from '@/components/date-range-filter'
import { ResumenPorDivision } from '@/components/resumen-por-division'
import { AreaChart } from '@/components/area-chart'
import { BillingStats } from '@/components/billing-stats'
import { ActivityTable } from '@/components/activity-table'
import { useAuth } from '@/lib/auth-context'

/**
 * Panel principal del administrador y del socio.
 *
 * El jefe de área tiene el suyo (`DashboardJefeArea`) y se devuelve antes de
 * montar nada de este archivo. Los dos paneles son distintos de verdad: este ve
 * la empresa entera, aquel solo su división. Mezclarlos en un mismo componente
 * haría fácil que un número global se colara en la vista del jefe, que es
 * exactamente lo que no debe pasar.
 */
export default function PanelPrincipal() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()
  const esJefeArea = usuario?.rol === 'jefe_area'
  // El administrador ve la empresa entera, así que no elige división: el filtro
  // obligaba a recordar cuál era "la buena" y ocultaba el resto.
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (usuario.rol === 'socio') {
      // El panel es de lectura, así que el socio sí lo ve. Lo que no le vale es
      // su enlace a /actividades, que es el módulo de registro.
      return
    } else if (usuario.rol !== 'admin' && usuario.rol !== 'jefe_area') {
      router.replace('/actividades')
    }
  }, [cargando, usuario, router])

  if (cargando || !usuario || (usuario.rol !== 'admin' && usuario.rol !== 'jefe_area' && usuario.rol !== 'socio')) return null

  // El jefe de área tiene su propio panel: más denso, con equipo, cumplimiento,
  // alertas y cartera de su división. Este es el del administrador y el socio, y
  // no se toca. Un mismo archivo que devuelve dos cosas distintas acabaría
  // mezclando lo global con lo del área.
  if (usuario?.rol === 'admin' || usuario?.rol === 'socio') return <DashboardAdministrador />
  if (esJefeArea) return <DashboardJefeArea />

  return (
    <MainLayout title="Panel Principal" subtitle="Resumen de toda la empresa">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeFilter
            desde={desde}
            hasta={hasta}
            onChange={(d, h) => {
              setDesde(d)
              setHasta(h)
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <ResumenPorDivision areaId="" desde={desde} hasta={hasta} />
          <AreaChart areaId="" desde={desde} hasta={hasta} />
          <BillingStats areaId="" desde={desde} hasta={hasta} />
        </div>

        <ActivityTable areaId="" desde={desde} hasta={hasta} />
      </div>
    </MainLayout>
  )
}
