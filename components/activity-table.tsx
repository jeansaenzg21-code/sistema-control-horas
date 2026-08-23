'use client'

import { useMemo } from 'react'
import { MoreVertical } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge } from './status-badge'
import { FacturableBadge } from './facturable-badge'
import { useRegistros } from '@/lib/use-registros'
import { useAuth } from '@/lib/auth-context'
import { fechaLocalISO } from '@/lib/utils'

interface ActivityTableProps {
  areaId?: string
  desde?: string
  hasta?: string
}

export function ActivityTable({ areaId = '', desde = '', hasta = '' }: ActivityTableProps) {
  const registros = useRegistros()
  const { usuario } = useAuth()

  const actividades = useMemo(() => {
    let filtrados = registros
    if (areaId) {
      filtrados = filtrados.filter((r) => String(r.area_id) === areaId)
    }
    if (desde) {
      filtrados = filtrados.filter((r) => fechaLocalISO(r.inicio) >= desde)
    }
    if (hasta) {
      filtrados = filtrados.filter((r) => fechaLocalISO(r.inicio) <= hasta)
    }
    return filtrados.slice(0, 5)
  }, [registros, areaId, desde, hasta])

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
              {['Actividad', 'Cliente', 'Usuario', 'Duración', 'Estado', 'Facturación', 'Fecha', ''].map((encabezado) => (
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
                  <p className="font-medium text-foreground">{actividad.descripcion}</p>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{actividad.cliente_nombre ?? '—'}</td>
                <td className="px-3 py-2 text-muted-foreground">{actividad.usuario_nombre ?? '—'}</td>
                <td className="px-3 py-2 font-medium text-foreground">{formatDuracion(actividad)}</td>
                <td className="px-3 py-2">
                  <StatusBadge estado={actividad.estado} />
                </td>
                <td className="px-3 py-2">
                  <FacturableBadge valor={actividad.facturable} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">{fechaLocalISO(actividad.inicio)}</td>
                <td className="px-3 py-2 text-center">
                  <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <MoreVertical size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {actividades.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
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

function formatDuracion(r: { inicio: string; fin: string | null; pausa_acumulada_segundos: number }): string {
  if (!r.fin || !r.inicio) return '—'
  const inicio = new Date(r.inicio).getTime()
  const fin = new Date(r.fin).getTime()
  if (isNaN(inicio) || isNaN(fin)) return '—'
  const totalSeg = Math.max(0, Math.floor((fin - inicio) / 1000) - r.pausa_acumulada_segundos)
  const h = Math.floor(totalSeg / 3600)
  const m = Math.floor((totalSeg % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
