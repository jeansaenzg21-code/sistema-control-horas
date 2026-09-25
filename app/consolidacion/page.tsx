'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { ConsolidationTable } from '@/components/consolidation-table'
import { useAuth } from '@/lib/auth-context'

export default function Consolidacion() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && usuario?.rol !== 'admin' && usuario?.rol !== 'jefe_area') {
      router.replace('/')
    }
  }, [cargando, usuario, router])

  if (cargando || !usuario || (usuario.rol !== 'admin' && usuario.rol !== 'jefe_area')) return null

  return (
    <MainLayout title="Consolidación" subtitle="Horas consolidadas de todos los consultores">
      <ConsolidationTable />
    </MainLayout>
  )
}