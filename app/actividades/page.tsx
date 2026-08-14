'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { ActivityForm } from '@/components/activity-form'
import { ActivityCard } from '@/components/activity-card'
import { ActivityList } from '@/components/activity-list'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'

export default function Actividades() {
  const { actividadActual } = useActividad()
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && usuario?.rol === 'admin') {
      router.replace('/')
    }
  }, [cargando, usuario, router])

  if (cargando || !usuario || usuario.rol === 'admin') return null

  return (
    <MainLayout
      title="Actividades"
      subtitle="Registra tu actividad actual o consulta tus registros"
    >
      <div className="space-y-5">
        {actividadActual ? (
          <ActivityCard />
        ) : (
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">Nueva actividad</h2>
              <p className="text-sm text-muted-foreground">
                Completa los datos para comenzar a registrar tu tiempo.
              </p>
            </div>
            <ActivityForm />
          </section>
        )}

        <section>
          <div className="mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Actividades finalizadas
            </h2>
          </div>
          <ActivityList />
        </section>
      </div>
    </MainLayout>
  )
}