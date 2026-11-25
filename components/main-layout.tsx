'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { obtenerModulosVisibles, Sidebar } from './sidebar'
import { Header } from './header'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'
import './dashboard-admin.css'

interface MainLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  /**
   * `normal` (por defecto) es el ancho de lectura del resto de la aplicación.
   * `ancho` es para módulos con tablas grandes, como la cartera de clientes,
   * donde 1280 px dejaba las columnas apretadas y con scroll horizontal.
   */
  headerActions?: React.ReactNode
  ancho?: 'normal' | 'ancho'
}

export function MainLayout({ children, title, subtitle, ancho = 'normal', headerActions }: MainLayoutProps) {
  const { usuario, empresaActiva, cargando } = useAuth()
  const esAdmin = usuario?.rol === 'admin'
  const claveSidebar = esAdmin ? 'admin-sidebar-minimizada' : 'sidebar-minimizada'
  const router = useRouter()
  const pathname = usePathname()
  const registroHoras = pathname === '/actividades'
  const navegacionMovil = Boolean(usuario && empresaActiva)
  const { itemsVisibles, itemsTIVisibles } = obtenerModulosVisibles(usuario)
  const etiquetasMoviles: Record<string, string> = {
    '/': 'Inicio',
    '/actividades': 'Horas',
    '/aprobaciones': usuario?.rol === 'personal' ? 'Solicitudes' : usuario?.rol === 'socio' ? 'Aprobaciones' : 'Aprobar',
    '/cumplimiento': 'Equipo',
  }
  const accesosMoviles = [...itemsVisibles, ...itemsTIVisibles]
  const barraMovil = useRef<HTMLElement>(null)
  const activoMovil = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [sidebarMinimizada, setSidebarMinimizada] = useState<boolean | null>(null)
  const minimizada = sidebarMinimizada ?? true

  useEffect(() => {
    if (cargando) return
    if (!usuario) {
      router.replace('/login')
    } else if (!empresaActiva) {
      router.replace('/login')
    }
  }, [cargando, usuario, empresaActiva, router])

  useEffect(() => {
    const guardada = localStorage.getItem(claveSidebar)
    setSidebarMinimizada(guardada === null || guardada === 'true')
  }, [claveSidebar])

  useEffect(() => {
    const barra = barraMovil.current
    const enlace = barra?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!barra || !enlace || !barra.clientWidth) return

    const limites = barra.getBoundingClientRect()
    const activo = enlace.getBoundingClientRect()
    if (activo.left < limites.left) barra.scrollLeft += activo.left - limites.left
    if (activo.right > limites.right) barra.scrollLeft += activo.right - limites.right
  }, [pathname, navegacionMovil])

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
      const siguiente = !(anterior ?? true)
      localStorage.setItem(claveSidebar, String(siguiente))
      return siguiente
    })
  }

  if (!cargando && (!usuario || !empresaActiva)) return null

  return (
    <div className={cn("app-module-layout admin-shell flex min-h-screen bg-background", navegacionMovil && "mobile-module-nav", registroHoras && "mobile-hours", (esAdmin || usuario?.rol === 'socio') && pathname === "/" && "admin-home")}>
      <Sidebar
        abierto={menuAbierto}
        minimizada={minimizada}
        onAlternarMinimizado={alternarSidebar}
        onCerrar={() => setMenuAbierto(false)}
      />

      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col transition-[padding] duration-200',
          minimizada ? 'md:pl-[4.75rem]' : 'md:pl-56',
        )}
      >
        <Header

          actions={headerActions}
          title={title}
          subtitle={subtitle}
          onAbrirMenu={() => setMenuAbierto(true)}
        />

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="app-module-content" data-wide={ancho === 'ancho'}>
            {children}
          </div>
        </main>
        {navegacionMovil && <nav ref={barraMovil} className="mobile-hours-nav no-print" aria-label="Navegación móvil">
          {accesosMoviles.map(({ href, label, icon }) => (
            <Link key={href} href={href} aria-current={activoMovil(href) ? 'page' : undefined}>
              <span aria-hidden="true">{icon}</span>
              {etiquetasMoviles[href] ?? label}
            </Link>
          ))}
        </nav>}
      </div>
    </div>
  )
}
