'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { ActivityWidget } from './activity-widget'
import { useAuth } from '@/lib/auth-context'

interface MainLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  const { usuario, cargando } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!cargando && !usuario) {
      router.replace('/login')
    }
  }, [cargando, usuario, router])

  if (cargando || !usuario) return null

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />

      <div className="flex flex-1 flex-col pl-64">
        <Header title={title} subtitle={subtitle} />

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto max-w-7xl px-4 py-3">{children}</div>
        </main>
      </div>

      {usuario.rol !== 'admin' && <ActivityWidget />}
    </div>
  )
}