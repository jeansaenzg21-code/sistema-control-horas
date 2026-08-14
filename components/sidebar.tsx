'use client'

import {
  LayoutDashboard,
  ListTodo,
  CheckCircle,
  BarChart3,
  FileText,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Logo } from './logo'
import { useAuth, type Rol } from '@/lib/auth-context'

interface NavItem {
  label: string
  href: string
  icon: React.ReactNode
  roles: Rol[]
}

const navItems: NavItem[] = [
  { label: 'Panel Principal', href: '/', icon: <LayoutDashboard size={19} />, roles: ['admin', 'abogado'] },
  { label: 'Actividades', href: '/actividades', icon: <ListTodo size={19} />, roles: ['abogado'] },
  { label: 'Aprobaciones', href: '/aprobaciones', icon: <CheckCircle size={19} />, roles: ['admin', 'abogado'] },
  { label: 'Consolidación', href: '/consolidacion', icon: <BarChart3 size={19} />, roles: ['admin'] },
  { label: 'Reportes', href: '/reportes', icon: <FileText size={19} />, roles: ['admin', 'abogado'] },
]

export function Sidebar() {
  const pathname = usePathname()
  const { usuario } = useAuth()

  const itemsVisibles = navItems.filter((item) => item.roles.includes(usuario?.rol ?? 'abogado'))

  return (
    <aside className="no-print fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Marca */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <Logo size={38} />
        <div>
          <h1 className="text-[15px] font-bold leading-tight text-sidebar-foreground">
            Paredes Cano
          </h1>
          <p className="text-[11px] text-muted-foreground">Registro de horas</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Módulos
        </p>
        {itemsVisibles.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
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
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}