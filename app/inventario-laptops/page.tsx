'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { useAuth } from '@/lib/auth-context'
import { puedeVerInventarioLaptops } from '@/lib/permisos'
import DashboardLaptops from './DashboardLaptops'

export default function InventarioLaptopsPage() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (!puedeVerInventarioLaptops(usuario)) {
      router.replace('/')
    }
  }, [cargando, usuario, router])

  if (!cargando && (!usuario || !puedeVerInventarioLaptops(usuario))) return null

  return (
    <MainLayout
      title="Inventario de Laptops"
      subtitle="Gestiona equipos, asignaciones y estado del inventario"
      ancho="ancho"
    >
      <DashboardLaptops />
    </MainLayout>
  )
}
