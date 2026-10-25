'use client'

import dynamic from 'next/dynamic'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

const DashboardAdministrador = dynamic(
  () => import('@/components/dashboard-admin').then((modulo) => modulo.DashboardAdministrador),
  { loading: () => <CargandoPanel /> },
)

const DashboardJefeArea = dynamic(
  () => import('@/components/dashboard-jefe-area').then((modulo) => modulo.DashboardJefeArea),
  { loading: () => <CargandoPanel /> },
)

function CargandoPanel() {
  return <div role="status" className="mx-auto max-w-7xl animate-pulse space-y-3 px-4 py-4"><p className="sr-only">Cargando el panel…</p><div className="h-24 rounded-xl bg-muted" /><div className="h-40 rounded-xl bg-muted" /><div className="h-64 rounded-xl bg-muted" /></div>
}

export default function PanelPrincipal() {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (cargando) return
    if (!usuario) router.replace('/login')
    else if (usuario.rol !== 'admin' && usuario.rol !== 'jefe_area' && usuario.rol !== 'socio') router.replace('/actividades')
  }, [cargando, usuario, router])

  if (cargando || !usuario) return <CargandoPanel />
  if (usuario.rol === 'admin' || usuario.rol === 'socio') return <DashboardAdministrador />
  if (usuario.rol === 'jefe_area') return <DashboardJefeArea />
  return <CargandoPanel />
}
