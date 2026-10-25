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

  if (cargando) {
    return (
      <div className="flex min-h-screen bg-background">
        <div className="hidden w-56 shrink-0 border-r border-border bg-sidebar md:block" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30 flex min-h-14 items-center border-b border-border bg-header px-4 py-2 sm:px-6">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-foreground">{title}</h1>
              {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <main className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-[1680px] animate-pulse space-y-3 px-4 py-4">
              <div className="h-24 rounded-xl bg-muted" />
              <div className="h-40 rounded-xl bg-muted" />
              <div className="h-64 rounded-xl bg-muted" />
            </div>
          </main>
        </div>
      </div>
    )
  }

  if (!usuario || !empresaActiva) return null

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
