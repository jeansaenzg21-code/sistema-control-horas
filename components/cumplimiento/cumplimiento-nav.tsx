'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarOff, CalendarRange, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { cn } from '@/lib/utils'

const pestanas = [
  {
    href: '/cumplimiento',
    exacta: true,
    etiqueta: 'Resumen',
    icono: <LayoutDashboard size={15} />,
  },
  {
    href: '/cumplimiento/matriz',
    etiqueta: 'Matriz',
    icono: <CalendarRange size={15} />,
  },
  {
    href: '/cumplimiento/excepciones',
    etiqueta: 'Excepciones',
    icono: <CalendarOff size={15} />,
  },
]

export function CumplimientoNav() {
  const pathname = usePathname()
  const { usuario } = useAuth()
  const pestanasVisibles = usuario?.rol === 'jefe_area' || usuario?.rol === 'socio'
    ? pestanas.filter((p) => p.href !== '/cumplimiento/excepciones')
    : pestanas

  return (
    <nav className="no-print flex items-center gap-1 overflow-x-auto border-b border-border">
      {pestanasVisibles.map((p) => {
        const activa = p.exacta ? pathname === p.href : pathname.startsWith(p.href)
        return (
          <Link
            key={p.href}
            href={p.href}
            className={cn(
              'flex shrink-0 items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium transition-colors',
              activa
                ? 'border-[#7c3aed] text-[#c4b5fd]'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {p.icono}
            {p.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}