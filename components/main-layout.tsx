'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { useAuth } from '@/lib/auth-context'

interface MainLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  /**
   * `normal` (por defecto) es el ancho de lectura del resto de la aplicación.
   * `ancho` es para módulos con tablas grandes, como la cartera de clientes,
   * donde 1280 px dejaba las columnas apretadas y con scroll horizontal.
   */
  ancho?: 'normal' | 'ancho'
}

export function MainLayout({ children, title, subtitle, ancho = 'normal' }: MainLayoutProps) {
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

      {/* pl-56 = 224 px, el mismo ancho que el sidebar en md (w-56). Si cambia
          uno, hay que cambiar el otro o queda un hueco o se solapa. */}
      <div className="flex min-w-0 flex-1 flex-col md:pl-56">
        <Header
          title={title}
          subtitle={subtitle}
          onAbrirMenu={() => setMenuAbierto(true)}
        />

        <main className="flex-1 overflow-y-auto bg-background">
          <div className={ancho === 'ancho' ? 'mx-auto max-w-[1680px] px-4 py-3' : 'mx-auto max-w-7xl px-4 py-3'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
