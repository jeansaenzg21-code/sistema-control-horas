'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

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
  const pathname = usePathname()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [sidebarMinimizada, setSidebarMinimizada] = useState(false)

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (!empresaActiva) {
      router.replace('/hub')
    }
  }, [cargando, usuario, empresaActiva, router])

  useEffect(() => {
    setSidebarMinimizada(localStorage.getItem('sidebar-minimizada') === 'true')
  }, [])

  // Al cambiar de modulo el cajon movil debe quedar cerrado, aunque la
  // navegacion no venga de un enlace del propio menu.
  useEffect(() => {
    setMenuAbierto(false)
  }, [pathname])

  useEffect(() => {
    if (!menuAbierto) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const alPresionar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setMenuAbierto(false)
    }
    document.addEventListener('keydown', alPresionar)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', alPresionar)
    }
  }, [menuAbierto])

  const alternarSidebar = () => {
    setSidebarMinimizada((anterior) => {
      const siguiente = !anterior
      localStorage.setItem('sidebar-minimizada', String(siguiente))
      return siguiente
    })
  }

  if (cargando || !usuario || !empresaActiva) return null

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        abierto={menuAbierto}
        minimizada={sidebarMinimizada}
        onAlternarMinimizado={alternarSidebar}
        onCerrar={() => setMenuAbierto(false)}
      />

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-[padding] duration-200',
          sidebarMinimizada ? 'md:pl-[4.75rem]' : 'md:pl-56',
        )}
      >
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
