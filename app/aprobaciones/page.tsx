'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { ApprovalList } from '@/components/approval-list'
import { useAuth } from '@/lib/auth-context'

export default function Aprobaciones() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()
  const esJefeArea = usuario?.rol === 'jefe_area'

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login')
    if (!cargando && usuario?.rol === 'socio') router.replace('/')
  }, [cargando, usuario, router])

  if (cargando || !usuario || usuario.rol === 'socio') return null

  return (
    <MainLayout
      title={esJefeArea ? 'Aprobaciones de tu área' : 'Aprobaciones'}
      subtitle={
        esJefeArea
          ? 'Revisa y aprueba los registros del equipo de tu división'
          : 'Revisa y gestiona el estado de tus registros'
      }
    >
      <ApprovalList />
    </MainLayout>
  )
}