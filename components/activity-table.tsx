'use client'

import { useMemo } from 'react'
import { MoreVertical } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from './status-badge'
import { fechaEnRango } from '@/lib/format'
import { useRegistros } from '@/lib/use-registros'
import { useAuth } from '@/lib/auth-context'

interface ActivityTableProps {
  areaId?: string
  desde?: string
  hasta?: string
}

export function ActivityTable({ areaId = '', desde = '', hasta = '' }: ActivityTableProps) {
  const registros = useRegistros()
  const { usuario } = useAuth()

  const actividades = useMemo(
    () =>
      registros
        .filter((r) => (!areaId || r.areaId === areaId) && fechaEnRango(r.fecha, desde, hasta))
        .slice(0, 5),
    [registros, areaId, desde, hasta],
  )

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Actividad reciente</h2>
          <p className="text-xs text-muted-foreground">Últimos registros</p>
        </div>
        <Link
          href={usuario?.rol === 'admin' ? '/consolidacion' : '/actividades'}
          className="text-sm font-medium text-[#c4b5fd] transition-colors hover:text-[#a78bfa]"
        >
          Ver todas →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Actividad', 'Usuario', 'Especialidad', 'Duración', 'Estado', 'Fecha', ''].map((encabezado) => (
                <th
                  key={encabezado}
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {encabezado}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {actividades.map((actividad) => (
              <tr
                key={actividad.id}
                className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30"
              >
                <td className="px-3 py-2">
                  <p className="font-medium text-foreground">{actividad.titulo}</p>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{actividad.usuarioNombre ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{actividad.especialidad}</td>
                <td className="px-3 py-2 font-medium text-foreground">{actividad.duracion}</td>
                <td className="px-3 py-2">
                  <StatusBadge estado={actividad.estado} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{actividad.fecha}</td>
                <td className="px-3 py-2 text-center">
                  <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <MoreVertical size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {actividades.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  No hay actividades registradas en esa fecha.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
