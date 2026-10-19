'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { CumplimientoNav } from '@/components/cumplimiento/cumplimiento-nav'
import { useAuth } from '@/lib/auth-context'

export default function CumplimientoLayout({ children }: { children: React.ReactNode }) {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && usuario?.rol !== 'admin' && usuario?.rol !== 'jefe_area' && usuario?.rol !== 'socio') router.replace('/')
  }, [cargando, usuario, router])

  if (cargando || !usuario || (usuario.rol !== 'admin' && usuario.rol !== 'jefe_area' && usuario.rol !== 'socio')) return null

  return (
    <MainLayout title="Cumplimiento" subtitle="Control de registro de horas por colaborador">
      <div className="space-y-3">
        <CumplimientoNav />
        {children}
      </div>
    </MainLayout>
  )
}