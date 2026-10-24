'use client'

import { Suspense, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { useAuth } from '@/lib/auth-context'
import { puedeVerGestionLaptops } from '@/lib/permisos'
import GestionLaptops from './GestionLaptops'

export default function GestionLaptopsPage() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (!puedeVerGestionLaptops(usuario)) {
      router.replace('/')
    }
  }, [cargando, usuario, router])

  if (cargando || !usuario || !puedeVerGestionLaptops(usuario)) return null

  return (
    <MainLayout
      title="Gestión de Laptops"
      subtitle="Registra, asigna y administra todos los equipos"
      ancho="ancho"
    >
      <Suspense fallback={null}>
        <GestionLaptops showHeading={false} />
      </Suspense>
    </MainLayout>
  )
}
