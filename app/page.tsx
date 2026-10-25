'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { DashboardAdministrador } from '@/components/dashboard-admin'
import { DashboardJefeArea } from '@/components/dashboard-jefe-area'

export default function PanelPrincipal() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (cargando) return
    if (!usuario) router.replace('/login')
    else if (usuario.rol !== 'admin' && usuario.rol !== 'jefe_area' && usuario.rol !== 'socio') router.replace('/actividades')
  }, [cargando, usuario, router])

  if (cargando || !usuario) return null
  if (usuario.rol === 'admin' || usuario.rol === 'socio') return <DashboardAdministrador />
  if (usuario.rol === 'jefe_area') return <DashboardJefeArea />
  return null
}
