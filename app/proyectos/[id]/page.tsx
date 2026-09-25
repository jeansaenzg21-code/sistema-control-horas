'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { ProyectoDetalleView } from '@/components/proyecto-detalle'
import { useAuth } from '@/lib/auth-context'

export default function ProyectoPage() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = Number(params.id)

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login')
  }, [cargando, usuario, router])

  if (cargando || !usuario) return null

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <MainLayout title="Detalle del proyecto" subtitle="Información, equipo y actividades vinculadas">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">El identificador del proyecto no es válido.</div>
      </MainLayout>
    )
  }

  return (
    <MainLayout title="Detalle del proyecto" subtitle="Información, equipo y actividades vinculadas">
      <ProyectoDetalleView id={id} />
    </MainLayout>
  )
}
