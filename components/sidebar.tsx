'use client'

import {
  LayoutDashboard,
  ListTodo,
  CheckCircle,
  BarChart3,
  CalendarCheck,
  FileText,
  Users,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { useAuth, type Rol } from '@/lib/auth-context'
import { ThemeToggle } from '@/components/theme-toggle'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: Rol[]
}

interface SidebarProps {
  abierto: boolean
  minimizada: boolean
  onAlternarMinimizado: () => void
  onCerrar: () => void
}

// Quién ve los módulos de administración y consulta: el admin de la empresa, el
// jefe de área (los que le tocan) y el socio. El socio entra por aquí porque ve
// todo igual que el admin, pero NO hereda su escritura: el bloqueo se decide en
// lib/auth.ts, no en el menú.
// El jefe tiene Aprobaciones porque revisa los registros de su propia área; la
// comprobación de a quién puede tocar es del servidor, no de este filtro.
const ROLES_CONSULTA: Rol[] = ['admin', 'jefe_area', 'socio']

const navItems: NavItem[] = [
  { label: 'Panel Principal', href: '/', icon: <LayoutDashboard size={19} />, roles: ROLES_CONSULTA },
  { label: 'Clientes', href: '/clientes', icon: <Users size={19} />, roles: ROLES_CONSULTA },
  // El supervisor siempre estuvo aquí aunque tampoco pueda registrar horas: su
  // módulo es el de aprobaciones, al que entra desde este enlace.
  { label: 'Actividades', href: '/actividades', icon: <ListTodo size={19} />, roles: ['personal', 'supervisor', 'jefe_area'] },
  { label: 'Aprobaciones', href: '/aprobaciones', icon: <CheckCircle size={19} />, roles: ['admin', 'supervisor', 'personal', 'jefe_area'] },
  { label: 'Consolidación', href: '/consolidacion', icon: <BarChart3 size={19} />, roles: ROLES_CONSULTA },
  { label: 'Cumplimiento', href: '/cumplimiento', icon: <CalendarCheck size={19} />, roles: ROLES_CONSULTA },
  { label: 'Reportes', href: '/reportes', icon: <FileText size={19} />, roles: ROLES_CONSULTA },
]

export function Sidebar({ abierto, minimizada, onAlternarMinimizado, onCerrar }: SidebarProps) {
  const pathname = usePathname()
  const { usuario } = useAuth()
  const itemsVisibles = navItems.filter((item) => item.roles.includes(usuario?.rol ?? 'personal'))

  return (
    <>
      {abierto && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={onCerrar}
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}

      <aside
        className={cn(
          'no-print fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar transition-[width,transform] duration-200 md:max-w-none md:translate-x-0',
          minimizada ? 'md:w-[4.75rem]' : 'md:w-56',
          abierto ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3 border-b border-sidebar-border px-5 py-5',
            minimizada && 'md:flex-col md:gap-2 md:px-1.5',
          )}
        >
          <Logo size={38} />
          <div className={cn('min-w-0', minimizada && 'md:hidden')}>
            <h1 className="truncate text-[15px] font-bold leading-tight text-sidebar-foreground">
              Paredes Cano
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">Registro de horas</p>
          </div>
          <button
            type="button"
            onClick={onAlternarMinimizado}
            aria-label={minimizada ? 'Expandir menú' : 'Minimizar menú'}
            title={minimizada ? 'Expandir menú' : 'Minimizar menú'}
            className={cn(
              'hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:flex',
              minimizada ? 'md:mx-auto' : 'ml-auto',
            )}
          >
            {minimizada ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Minimizar menú"
            className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav
          aria-label="Módulos"
          className={cn('flex-1 space-y-1 overflow-y-auto px-3 py-4', minimizada && 'md:px-1.5')}
        >
          <p
            className={cn(
              'px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
              minimizada && 'md:hidden',
            )}
          >
            Módulos
          </p>
          {itemsVisibles.map((item) => {
            const isActive =
              pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`))
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCerrar}
                title={minimizada ? item.label : undefined}
                aria-label={minimizada ? item.label : undefined}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  minimizada && 'md:justify-center md:px-0',
                  isActive
                    ? 'bg-[#7c3aed]/10 text-[#c4b5fd]'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#7c3aed]" />
                )}
                <span className={cn('transition-colors', isActive ? 'text-[#c4b5fd]' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground')}>
                  {item.icon}
                </span>
                <span className={cn(minimizada && 'md:hidden')}>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className={cn('border-t border-sidebar-border px-3 py-3', minimizada && 'md:px-1.5')}>
          <ThemeToggle />
        </div>
      </aside>
    </>
  )
}
