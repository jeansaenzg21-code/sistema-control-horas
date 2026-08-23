'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { SettingsClients } from '@/components/settings-clients'
import { useAuth } from '@/lib/auth-context'

export default function ClientesPage() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && usuario?.rol !== 'admin') router.replace('/')
  }, [cargando, usuario, router])

  if (cargando || !usuario || usuario.rol !== 'admin') return null

  return (
    <MainLayout title="Clientes" subtitle="Registra y administra los clientes de Paredes Cano">
      <SettingsClients />
    </MainLayout>
  )
}
