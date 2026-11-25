'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarCheck, CheckCircle, Clock, House, Menu } from 'lucide-react'
import { Sidebar } from './sidebar'
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
  const verEquipo = esAdmin || usuario?.rol === 'jefe_area' || usuario?.rol === 'socio'
  const verHoras = usuario?.rol === 'jefe_area' || usuario?.rol === 'personal' || usuario?.rol === 'supervisor'
  const accesosMoviles = [
    ...(verEquipo ? [{ href: '/', texto: 'Inicio', Icono: House }, { href: '/cumplimiento', texto: 'Equipo', Icono: CalendarCheck }] : []),
    ...(verHoras ? [{ href: '/actividades', texto: 'Horas', Icono: Clock }] : []),
    { href: '/aprobaciones', texto: usuario?.rol === 'personal' ? 'Solicitudes' : usuario?.rol === 'socio' ? 'Aprobaciones' : 'Aprobar', Icono: CheckCircle },
  ]
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
        {navegacionMovil && <nav className="mobile-hours-nav no-print" aria-label="Navegación móvil">
          {accesosMoviles.map(({ href, texto, Icono }) => (
            <Link key={href} href={href} aria-current={activoMovil(href) ? 'page' : undefined}>
              <Icono size={19} aria-hidden="true" />{texto}
            </Link>
          ))}
          <button
            type="button"
            aria-expanded={menuAbierto}
            data-current={!accesosMoviles.some(({ href }) => activoMovil(href))}
            onClick={() => setMenuAbierto(true)}
          ><Menu size={20} aria-hidden="true" />Más</button>
        </nav>}
      </div>
    </div>
  )
}
