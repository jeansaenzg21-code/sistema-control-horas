'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { ActivityWidgetWrapper as ActivityWidget } from './activity-widget-wrapper'
import { useAuth } from '@/lib/auth-context'

interface MainLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  const { usuario, empresaActiva, cargando } = useAuth()
  const router = useRouter()
  const [menuAbierto, setMenuAbierto] = useState(false)

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (!empresaActiva) {
      router.replace('/hub')
    }
  }, [cargando, usuario, empresaActiva, router])

  if (cargando || !usuario || !empresaActiva) return null

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />

      <div className="flex min-w-0 flex-1 flex-col md:pl-64">
        <Header
          title={title}
          subtitle={subtitle}
          onAbrirMenu={() => setMenuAbierto(true)}
        />

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-7xl px-4 py-3">{children}</div>
        </main>
      </div>

      {usuario.rol !== 'admin' && <ActivityWidget />}
    </div>
  )
}
