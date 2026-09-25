'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { ProyectosLista } from '@/components/proyectos-lista'
import { useAuth } from '@/lib/auth-context'

export default function ProyectosPage() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login')
  }, [cargando, usuario, router])

  if (cargando || !usuario) return null

  return (
    <MainLayout title="Proyectos" subtitle="Coordina equipos y actividades de distintas divisiones">
      <ProyectosLista />
    </MainLayout>
  )
}
