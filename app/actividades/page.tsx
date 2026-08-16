'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, ListChecks, Play } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { ActivityCard } from '@/components/activity-card'
import { ActivityForm } from '@/components/activity-form'
import { MisRegistros } from '@/components/mis-registros'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { useRegistros } from '@/lib/use-registros'
import { cn } from '@/lib/utils'

type Pestana = 'registrar' | 'registros'

export default function Actividades() {
  const { actividadActual } = useActividad()
  const { usuario, cargando } = useAuth()
  const registros = useRegistros()
  const router = useRouter()
  const [pestana, setPestana] = useState<Pestana>('registrar')

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (usuario.rol === 'admin') {
      router.replace('/')
    }
  }, [cargando, usuario, router])

  const resumen = useMemo(() => {
    return {
      total: registros.length,
      pendientes: registros.filter((r) => r.estado === 'pendiente_aprobacion').length,
      aprobadas: registros.filter((r) => r.estado === 'aprobada').length,
    }
  }, [registros])

  if (cargando || !usuario || usuario.rol === 'admin') return null

  const fechaHoy = new Date().toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const primerNombre = usuario.nombre.trim().split(' ')[0]

  const pestañas: { id: Pestana; etiqueta: string; icono: React.ReactNode }[] = [
    { id: 'registrar', etiqueta: 'Registrar', icono: <Play size={16} /> },
    {
      id: 'registros',
      etiqueta: `Mis registros${resumen.total > 0 ? ` (${resumen.total})` : ''}`,
      icono: <ListChecks size={16} />,
    },
  ]

  const tarjetasResumen = [
    { etiqueta: 'Registros', valor: String(resumen.total) },
    { etiqueta: 'Aprobados', valor: String(resumen.aprobadas) },
    { etiqueta: 'Pendientes', valor: String(resumen.pendientes) },
  ]

  return (
    <MainLayout
      title="Actividades"
      subtitle="Registra tu tiempo y consulta tus registros"
    >
      <div className="space-y-5">
        <div className="flex gap-1 border-b border-border">
          {pestañas.map((p) => (
            <button
              key={p.id}
              onClick={() => setPestana(p.id)}
              className={cn(
                'flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
                pestana === p.id
                  ? 'border-[#7c3aed] text-[#c4b5fd]'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {p.icono}
              {p.etiqueta}
            </button>
          ))}
        </div>

        {pestana === 'registrar' ? (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs capitalize text-muted-foreground">{fechaHoy}</p>
                <h2 className="text-lg font-semibold text-foreground">Hola, {primerNombre}</h2>
                <p className="text-sm text-muted-foreground">
                  {actividadActual
                    ? 'Tienes una actividad en curso, puedes pausarla o finalizarla.'
                    : '¿Qué vas a trabajar hoy?'}
                </p>
                {actividadActual && (
                  <div className="mt-2 flex w-fit items-center gap-2 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1.5 text-sm font-medium text-[#c4b5fd]">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-[#a78bfa]" />
                    En curso
                  </div>
                )}
              </div>

              <div className="ml-auto flex divide-x divide-border rounded-lg bg-muted/60">
                {tarjetasResumen.map((tarjeta) => (
                  <div key={tarjeta.etiqueta} className="px-4 py-2 text-center">
                    <p className="text-lg font-bold leading-tight text-foreground">
                      {tarjeta.valor}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{tarjeta.etiqueta}</p>
                  </div>
                ))}
              </div>
            </div>

            {actividadActual ? (
              <ActivityCard />
            ) : (
              <section className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/15">
                    <CalendarCheck size={17} className="text-[#c4b5fd]" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-foreground">
                      Registrar nueva actividad
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Inicia el registro con fecha y hora automáticas.
                    </p>
                  </div>
                </div>
                <ActivityForm />
              </section>
            )}
          </>
        ) : (
          <MisRegistros />
        )}
      </div>
    </MainLayout>
  )
}
