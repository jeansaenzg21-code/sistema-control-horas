'use client'

import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { StatusBadge } from './status-badge'

function etiquetaFacturable(facturable: boolean | null | undefined): string {
  if (facturable == null) return 'Por definir'
  return facturable ? 'Facturable' : 'No facturable'
}

export function ActivityList() {
  const { historial } = useActividad()
  const { usuario } = useAuth()

  const historialFiltrado =
    usuario?.rol === 'abogado'
      ? historial.filter((a) => a.areaId === usuario.areaId || !a.areaId)
      : historial

  if (historialFiltrado.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aún no tienes actividades finalizadas.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          Cuando finalices una actividad aparecerá aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actividad
            </th>
            <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
              Fecha
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Inicio
            </th>
            <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground sm:table-cell">
              Fin
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Duración
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {historialFiltrado.map((actividad) => (
            <tr
              key={actividad.id}
              className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"
            >
              <td className="px-4 py-2.5">
                <p className="font-medium text-foreground">{actividad.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {actividad.especialidad} · {etiquetaFacturable(actividad.facturable)}
                </p>
              </td>
              <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                {actividad.fecha}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{actividad.horaInicio}</td>
              <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                {actividad.horaFin ?? '—'}
              </td>
              <td className="px-4 py-2.5 font-medium text-foreground">
                {actividad.duracion ?? '—'}
              </td>
              <td className="px-4 py-2.5">
                <StatusBadge estado={actividad.estado} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}