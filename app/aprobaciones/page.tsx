'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { ApprovalList } from '@/components/approval-list'
import { useAuth } from '@/lib/auth-context'

export default function Aprobaciones() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && usuario?.rol === 'jefe_area') router.replace('/actividades')
  }, [cargando, usuario, router])

  if (cargando || usuario?.rol === 'jefe_area') return null

  return (
    <MainLayout
      title="Aprobaciones"
      subtitle="Revisa y gestiona el estado de tus registros"
    >
      <ApprovalList />
    </MainLayout>
  )
}