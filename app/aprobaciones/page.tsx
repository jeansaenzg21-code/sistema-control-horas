'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { PeriodoAprobacionesControl, type PeriodoAprobaciones } from '@/components/aprobaciones-admin-vista'
import { ApprovalList } from '@/components/approval-list'
import { useAuth } from '@/lib/auth-context'

export default function Aprobaciones() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()
  const [periodo, setPeriodo] = useState<PeriodoAprobaciones>({ desde: '', hasta: '' })
  const esAdmin = usuario?.rol === 'admin'
  const esJefeArea = usuario?.rol === 'jefe_area'

  useEffect(() => {
    if (!cargando && !usuario) router.replace('/login')

  }, [cargando, usuario, router])

  if (cargando || !usuario) return null

  return (
    <MainLayout
      ancho="ancho"
      headerActions={<PeriodoAprobacionesControl periodo={periodo} onChange={setPeriodo} />}
      title={esJefeArea ? 'Aprobaciones de tu área' : 'Aprobaciones'}
      subtitle={
        esJefeArea
          ? 'Revisa y aprueba los registros del equipo de tu división'
          : usuario.rol === 'socio' ? 'Consulta las solicitudes de aprobación de la empresa'
            : esAdmin || usuario.rol === 'supervisor' ? 'Revisa y gestiona las solicitudes de registro de horas' : 'Consulta el estado y el historial de tus solicitudes de registro'
      }
    >
      <ApprovalList periodo={periodo} />
    </MainLayout>
  )
}