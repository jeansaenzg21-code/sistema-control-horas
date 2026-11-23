'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarOff, CalendarRange, LayoutDashboard } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import styles from './cumplimiento.module.css'

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
  const pestanasVisibles = usuario?.rol === 'jefe_area' && usuario.area_id == null
    ? pestanas.filter((p) => p.href !== '/cumplimiento/excepciones')
    : pestanas

  return (
    <nav aria-label="Vistas de cumplimiento" className={`no-print ${styles.nav}`}>
      {pestanasVisibles.map((p) => {
        const activa = p.exacta ? pathname === p.href : pathname.startsWith(p.href)
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={activa ? 'page' : undefined}
            className={styles.navLink}
          >
            {p.icono}
            {p.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}